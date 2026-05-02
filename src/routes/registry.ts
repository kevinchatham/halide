import type { Context, Hono, MiddlewareHandler } from 'hono';
import type { DescribeRouteOptions, ResponsesWithResolver } from 'hono-openapi';
import { describeRoute, resolver, validator } from 'hono-openapi';
import { DEFAULTS } from '../config/defaults';
import { extractBearerClaims, extractJwksClaims } from '../middleware/auth';
import { buildRequestContextFromHono, createProxyService } from '../services/proxy';
import type {
  ApiRoute,
  AuthorizeFn,
  ClaimExtractor,
  ObservabilityConfig,
  ProxyRoute,
  RequestContext,
  ServerConfig,
  THalideApp,
} from '../types';
import { createSecretCache } from '../utils/secretCache';

/** Internal Hono variables type. */
type HalideVariables = { rawBody?: unknown };

/** Create a claim extractor based on auth strategy configuration. */
function createClaimExtractor<TApp = unknown>(
  config: ServerConfig<TApp>,
  logger: THalideApp['logger'],
): ClaimExtractor<THalideApp<TApp>['claims']> | undefined {
  const auth = config.security?.auth;
  if (!auth) return undefined;

  if (auth.strategy === 'jwks' && auth.jwksUri) {
    const { jwksUri, audience } = auth;
    return (c: Context) => extractJwksClaims<THalideApp<TApp>['claims']>(c, jwksUri, audience);
  }

  if (auth.secret) {
    const { secret, audience, secretTtl } = auth;
    const ttl = secretTtl ?? DEFAULTS.auth.secretTtl;
    const cachedResolver = createSecretCache(ttl, logger);
    return async (c: Context) => {
      const resolvedSecret = await cachedResolver(secret);
      return extractBearerClaims<THalideApp<TApp>['claims']>(c, resolvedSecret, audience);
    };
  }

  return undefined;
}

/** Build OpenAPI describeRoute options from route metadata. */
function buildDescribeRouteOptions<TApp>(
  route: ApiRoute<TApp> | ProxyRoute<TApp>,
): DescribeRouteOptions {
  const meta = route.openapi;
  const options: DescribeRouteOptions = {};

  if (meta?.summary) options.summary = meta.summary;
  if (meta?.description) options.description = meta.description;
  if (meta?.tags?.length) options.tags = meta.tags;

  if (route.observe === false) options.hide = true;

  options.requestBody = buildRequestBody(route);
  options.responses = buildResponses(route);

  return options;
}

/** Build OpenAPI request body from route request schema. */
function buildRequestBody<TApp>(
  route: ApiRoute<TApp> | ProxyRoute<TApp>,
): DescribeRouteOptions['requestBody'] {
  const schema = route.type === 'api' ? route.requestSchema : undefined;
  if (!schema) return undefined;

  const typeName = (schema as { _def?: { typeName?: string } })._def?.typeName;
  const isOptional = typeName === 'ZodOptional' || typeName === 'ZodNullable';

  return {
    content: {
      'application/json': { schema: resolver(schema) as unknown as Record<string, unknown> },
    },
    required: !isOptional,
  };
}

/** Build OpenAPI responses object from route metadata. */
function buildResponses<TApp>(route: ApiRoute<TApp> | ProxyRoute<TApp>): ResponsesWithResolver {
  const meta = route.openapi;
  const responses: ResponsesWithResolver = {};

  if (meta?.responses) {
    for (const [status, resp] of Object.entries(meta.responses)) {
      const response: Record<string, unknown> = { description: resp.description };
      if (resp.schema) {
        response.content = { 'application/json': { schema: resolver(resp.schema) } };
      }
      responses[status] = response as ResponsesWithResolver[string];
    }
  } else if (route.type === 'api' && route.responseSchema) {
    responses['200'] = {
      content: { 'application/json': { schema: resolver(route.responseSchema) } },
      description: 'Successful response',
    } as ResponsesWithResolver[string];
  } else {
    responses['200'] = { description: 'Successful response' } as ResponsesWithResolver[string];
  }

  return responses;
}

/** Extract JWT claims from request using the claim extractor. */
async function extractClaims<TApp>(
  c: Context,
  route: { access: string },
  claimExtractor: ClaimExtractor<THalideApp<TApp>['claims']> | undefined,
): Promise<{ claims: THalideApp<TApp>['claims'] | undefined; response: Response | null }> {
  if (route.access === 'public' || !claimExtractor) {
    return { claims: undefined, response: null };
  }
  const extracted = await claimExtractor(c);
  if (extracted === null) {
    return {
      claims: undefined,
      response: new Response(JSON.stringify({ error: 'Unauthorized' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 401,
      }),
    };
  }
  return { claims: extracted, response: null };
}

/** Check if the request is authorized using the route's authorize function. */
async function checkAuthorization<TApp>(
  c: Context,
  route: { authorize?: AuthorizeFn<TApp> },
  app: TApp,
  body: unknown,
): Promise<Response | null> {
  if (!route.authorize) return null;
  try {
    const ctx = buildRequestContextFromHono(c, body);
    const allowed = await route.authorize(ctx, app);
    if (!allowed) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 403,
      });
    }
    return null;
  } catch {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      headers: { 'Content-Type': 'application/json' },
      status: 403,
    });
  }
}

/** Emit the onRequest observability hook if configured. */
function emitOnRequest<TApp>(
  c: Context,
  body: unknown,
  app: TApp,
  observability: ObservabilityConfig<TApp> | undefined,
  observe: boolean | undefined,
): void {
  if (observability?.onRequest && observe !== false) {
    const ctx = buildRequestContextFromHono(c, body);
    observability.onRequest(ctx, app);
  }
}

/** Context for response emission timing. */
interface ResponseEmitContext {
  /** Error thrown by the handler, if any. */
  handlerError: Error | undefined;
  /** Timestamp (Date.now()) when request processing started. */
  start: number;
  /** HTTP status code of the response. */
  statusCode: number;
}

/** Emit the onResponse observability hook if configured. */
function emitOnResponse<TApp>(
  c: Context,
  body: unknown,
  app: TApp,
  observability: ObservabilityConfig<TApp> | undefined,
  observe: boolean | undefined,
  ctx: ResponseEmitContext,
  responseBody?: unknown,
): void {
  if (observability?.onResponse && observe !== false) {
    const reqCtx = buildRequestContextFromHono(c, body);
    observability.onResponse(reqCtx, app, {
      body: responseBody,
      durationMs: Date.now() - ctx.start,
      error: ctx.handlerError,
      statusCode: ctx.statusCode,
    });
  }
}

/** Get validated JSON from request using Zod validation schema. */
function getValidJson(c: Context): unknown {
  return (c.req as unknown as { valid: (t: string) => unknown }).valid('json');
}

/** Resolve request body, using request schema if available. */
function resolveBody<TApp>(c: Context, route: ApiRoute<TApp>): unknown {
  if (route.requestSchema) return getValidJson(c);
  const methodsWithBody = new Set(['POST', 'PUT', 'PATCH']);
  return methodsWithBody.has(c.req.method.toUpperCase())
    ? c.req.json().catch(() => undefined)
    : undefined;
}

/** Register a route handler on the Hono app using the appropriate HTTP method. */
function registerRouteOnApp(
  app: Hono<{ Variables: HalideVariables }>,
  method: string,
  path: string,
  ...handlers: MiddlewareHandler[]
): void {
  const appRecord = app as unknown as Record<
    string,
    (path: string, ...handlers: MiddlewareHandler[]) => void
  >;
  const appMethod = appRecord[method];
  if (appMethod) {
    appMethod(path, ...handlers);
  }
}

/** Register an API route with all middleware, auth, and handler. */
function registerApiRoute<TApp = unknown>(
  app: Hono<{ Variables: HalideVariables }>,
  route: ApiRoute<TApp>,
  claimExtractor: ClaimExtractor<THalideApp<TApp>['claims']> | undefined,
  observability: ObservabilityConfig<TApp> | undefined,
  logger: THalideApp['logger'],
): void {
  const method = route.method ?? DEFAULTS.route.method;
  const middlewares: MiddlewareHandler[] = [];

  if (route.requestSchema) {
    middlewares.push(validator('json', route.requestSchema));
  }

  middlewares.push(describeRoute(buildDescribeRouteOptions(route)), async (c: Context) => {
    const start = Date.now();
    let handlerError: Error | undefined;
    let statusCode = 200;

    const { claims, response: authResponse } = await extractClaims(c, route, claimExtractor);
    if (authResponse) return authResponse;

    const authBody = route.requestSchema ? getValidJson(c) : undefined;
    const app: TApp = { claims, logger } as TApp;
    const forbidResponse = await checkAuthorization(c, route, app, authBody);
    if (forbidResponse) return forbidResponse;

    emitOnRequest(c, authBody, app, observability, route.observe);

    const body = await resolveBody(c, route);

    let result: unknown;
    try {
      const ctx = buildRequestContextFromHono(c, body) as RequestContext & { body: unknown };
      ctx.body = body;
      result = await route.handler(ctx, app);
    } catch (err) {
      handlerError = err instanceof Error ? err : new Error(String(err));
      statusCode = 500;
      throw err;
    } finally {
      emitOnResponse(
        c,
        body,
        app,
        observability,
        route.observe,
        { handlerError, start, statusCode },
        result,
      );
    }

    return c.json(result);
  });

  registerRouteOnApp(app, method, route.path, ...middlewares);
}

/** Register a proxy route with all middleware, auth, and forwarding. */
function registerProxyRoute<TApp = unknown>(
  app: Hono<{ Variables: HalideVariables }>,
  route: ProxyRoute<TApp>,
  claimExtractor: ClaimExtractor<THalideApp<TApp>['claims']> | undefined,
  observability: ObservabilityConfig<TApp> | undefined,
  logger: THalideApp['logger'],
): void {
  for (const method of route.methods) {
    app[method](route.path, describeRoute(buildDescribeRouteOptions(route)), async (c: Context) => {
      const start = Date.now();
      let handlerError: Error | undefined;
      let statusCode = 200;
      let proxyResponseBody: unknown;

      let parsedBody: unknown;
      if (route.transform) {
        parsedBody = await c.req.json().catch(() => ({}));
        c.set('rawBody', parsedBody);
      }

      const { claims, response: authResponse } = await extractClaims(c, route, claimExtractor);
      if (authResponse) {
        return new Response(authResponse.body, {
          headers: authResponse.headers,
          status: authResponse.status,
        });
      }

      const app: TApp = { claims, logger } as TApp;
      const forbidResponse = await checkAuthorization(c, route, app, parsedBody);
      if (forbidResponse) {
        return new Response(forbidResponse.body, {
          headers: forbidResponse.headers,
          status: forbidResponse.status,
        });
      }

      emitOnRequest(c, parsedBody, app, observability, route.observe);

      try {
        const proxyHandler = createProxyService(route, app, parsedBody);
        const response = await proxyHandler(c);
        statusCode = response.status;
        proxyResponseBody = await response
          .clone()
          .text()
          .catch(() => undefined);
        return response;
      } catch (err) {
        handlerError = err instanceof Error ? err : new Error(String(err));
        statusCode = 500;
        throw err;
      } finally {
        emitOnResponse(
          c,
          parsedBody,
          app,
          observability,
          route.observe,
          { handlerError, start, statusCode },
          proxyResponseBody,
        );
      }
    });
  }
}

/**
 * Register all API and proxy routes on the Hono application.
 * @typeParam TApp - The bundled app context type combining claims and logger.
 * @param app - The Hono application to register routes on.
 * @param config - The server configuration containing routes.
 * @param logger - Logger instance for observability.
 */
export function registerRoutes<TApp = unknown>(
  app: Hono<{ Variables: HalideVariables }>,
  config: ServerConfig<TApp>,
  logger: THalideApp['logger'],
): void {
  const claimExtractor = createClaimExtractor<TApp>(config, logger);

  if (config.apiRoutes) {
    for (const route of config.apiRoutes) {
      registerApiRoute(app, route, claimExtractor, config.observability, logger);
    }
  }

  if (config.proxyRoutes) {
    for (const route of config.proxyRoutes) {
      registerProxyRoute(app, route, claimExtractor, config.observability, logger);
    }
  }
}

export { buildRequestContextFromHono } from '../services/proxy';
