import type { Context, Hono, MiddlewareHandler } from 'hono';
import type { DescribeRouteOptions, ResponsesWithResolver } from 'hono-openapi';
import { describeRoute, resolver, validator } from 'hono-openapi';
import { DEFAULTS } from '../config/defaults';
import { extractBearerClaims, extractJwksClaims } from '../middleware/auth';
import { buildRequestContextFromHono, createProxyService } from '../services/proxy';
import type {
  ApiRoute,
  ClaimExtractor,
  Logger,
  ObservabilityConfig,
  ProxyRoute,
  RequestContext,
  ServerConfig,
} from '../types';

type HalideVariables = { rawBody?: unknown };

async function resolveSecret(secret: () => string | Promise<string>): Promise<string> {
  return secret();
}

function createClaimExtractor<TClaims = unknown>(
  config: ServerConfig<TClaims>,
): ClaimExtractor<TClaims> | undefined {
  const auth = config.security?.auth;
  if (!auth) return undefined;

  if (auth.strategy === 'jwks' && auth.jwksUri) {
    const { jwksUri, audience } = auth;
    return (c: Context) => extractJwksClaims<TClaims>(c, jwksUri, audience);
  }

  if (auth.secret) {
    const { secret, audience } = auth;
    return async (c: Context) => {
      const resolvedSecret = await resolveSecret(secret);
      return extractBearerClaims<TClaims>(c, resolvedSecret, audience);
    };
  }

  return undefined;
}

function buildDescribeRouteOptions<TClaims>(
  route: ApiRoute<TClaims> | ProxyRoute<TClaims>,
): DescribeRouteOptions {
  const meta = route.openapi;
  const options: DescribeRouteOptions = {};

  if (meta?.summary) options.summary = meta.summary;
  if (meta?.description) options.description = meta.description;
  if (meta?.tags?.length) options.tags = meta.tags;

  if (route.observe === false) options.hide = true;

  options.responses = buildResponses(meta);

  return options;
}

function buildResponses(meta: ApiRoute['openapi']): ResponsesWithResolver {
  const responses: ResponsesWithResolver = {};

  if (meta?.responses) {
    for (const [status, resp] of Object.entries(meta.responses)) {
      const response: Record<string, unknown> = { description: resp.description };
      if (resp.schema) {
        response.content = { 'application/json': { schema: resolver(resp.schema) } };
      }
      responses[status] = response as ResponsesWithResolver[string];
    }
  } else if (meta?.responseSchema) {
    responses['200'] = {
      content: { 'application/json': { schema: resolver(meta.responseSchema) } },
      description: 'Successful response',
    } as ResponsesWithResolver[string];
  } else {
    responses['200'] = { description: 'Successful response' } as ResponsesWithResolver[string];
  }

  return responses;
}

async function extractClaims<TClaims>(
  c: Context,
  route: { access: string },
  claimExtractor: ClaimExtractor<TClaims> | undefined,
): Promise<{ claims: TClaims | undefined; response: Response | null }> {
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

async function checkAuthorization<TClaims>(
  c: Context,
  route: { authorize?: ApiRoute<TClaims>['authorize'] },
  claims: TClaims | undefined,
  body: unknown,
  logger: Logger,
): Promise<Response | null> {
  if (!route.authorize) return null;
  try {
    const ctx = buildRequestContextFromHono(c, body);
    const allowed = await route.authorize(ctx, claims, logger);
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

function emitOnRequest<TClaims>(
  c: Context,
  body: unknown,
  claims: TClaims | undefined,
  observability: ObservabilityConfig<TClaims> | undefined,
  observe: boolean | undefined,
  logger: Logger,
): void {
  if (observability?.onRequest && observe !== false) {
    const ctx = buildRequestContextFromHono(c, body);
    observability.onRequest(ctx, claims, logger);
  }
}

interface ResponseEmitContext {
  handlerError: Error | undefined;
  start: number;
  statusCode: number;
}

function emitOnResponse<TClaims>(
  c: Context,
  body: unknown,
  claims: TClaims | undefined,
  observability: ObservabilityConfig<TClaims> | undefined,
  observe: boolean | undefined,
  ctx: ResponseEmitContext,
  logger: Logger,
): void {
  if (observability?.onResponse && observe !== false) {
    const reqCtx = buildRequestContextFromHono(c, body);
    observability.onResponse(
      reqCtx,
      claims,
      { durationMs: Date.now() - ctx.start, error: ctx.handlerError, statusCode: ctx.statusCode },
      logger,
    );
  }
}

function getValidJson(c: Context): unknown {
  return (c.req as unknown as { valid: (t: string) => unknown }).valid('json');
}

function resolveBody<TClaims>(c: Context, route: ApiRoute<TClaims>): unknown {
  if (route.validationSchema) return getValidJson(c);
  const methodsWithBody = new Set(['POST', 'PUT', 'PATCH']);
  return methodsWithBody.has(c.req.method.toUpperCase())
    ? c.req.json().catch(() => undefined)
    : undefined;
}

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

function registerApiRoute<TClaims = unknown>(
  app: Hono<{ Variables: HalideVariables }>,
  route: ApiRoute<TClaims>,
  claimExtractor: ClaimExtractor<TClaims> | undefined,
  observability: ObservabilityConfig<TClaims> | undefined,
  logger: Logger,
): void {
  const method = route.method ?? DEFAULTS.route.method;
  const middlewares: MiddlewareHandler[] = [];

  middlewares.push(describeRoute(buildDescribeRouteOptions(route)));

  if (route.validationSchema) {
    middlewares.push(validator('json', route.validationSchema));
  }

  middlewares.push(async (c: Context) => {
    const start = Date.now();
    let handlerError: Error | undefined;
    let statusCode = 200;

    const { claims, response: authResponse } = await extractClaims(c, route, claimExtractor);
    if (authResponse) return authResponse;

    const authBody = route.validationSchema ? getValidJson(c) : undefined;
    const forbidResponse = await checkAuthorization(c, route, claims, authBody, logger);
    if (forbidResponse) return forbidResponse;

    emitOnRequest(c, authBody, claims, observability, route.observe, logger);

    const body = await resolveBody(c, route);

    let result: unknown;
    try {
      const ctx = buildRequestContextFromHono(c, body) as RequestContext & { body: unknown };
      ctx.body = body;
      result = await route.handler(ctx, claims, logger);
    } catch (err) {
      handlerError = err instanceof Error ? err : new Error(String(err));
      statusCode = 500;
      throw err;
    } finally {
      emitOnResponse(
        c,
        body,
        claims,
        observability,
        route.observe,
        { handlerError, start, statusCode },
        logger,
      );
    }

    return c.json(result);
  });

  registerRouteOnApp(app, method, route.path, ...middlewares);
}

function registerProxyRoute<TClaims = unknown>(
  app: Hono<{ Variables: HalideVariables }>,
  route: ProxyRoute<TClaims>,
  claimExtractor: ClaimExtractor<TClaims> | undefined,
  observability: ObservabilityConfig<TClaims> | undefined,
  logger: Logger,
): void {
  for (const method of route.methods) {
    app[method](route.path, describeRoute(buildDescribeRouteOptions(route)), async (c: Context) => {
      const start = Date.now();
      let handlerError: Error | undefined;
      let statusCode = 200;

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

      const forbidResponse = await checkAuthorization(c, route, claims, parsedBody, logger);
      if (forbidResponse) {
        return new Response(forbidResponse.body, {
          headers: forbidResponse.headers,
          status: forbidResponse.status,
        });
      }

      emitOnRequest(c, parsedBody, claims, observability, route.observe, logger);

      try {
        const proxyHandler = createProxyService(route, claims, logger, parsedBody);
        return await proxyHandler(c);
      } catch (err) {
        handlerError = err instanceof Error ? err : new Error(String(err));
        statusCode = 500;
        throw err;
      } finally {
        emitOnResponse(
          c,
          parsedBody,
          claims,
          observability,
          route.observe,
          { handlerError, start, statusCode },
          logger,
        );
      }
    });
  }
}

export function registerRoutes<TClaims = unknown>(
  app: Hono<{ Variables: HalideVariables }>,
  config: ServerConfig<TClaims>,
  logger: Logger,
): void {
  const claimExtractor = createClaimExtractor<TClaims>(config);

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
