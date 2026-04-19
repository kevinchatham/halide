import type { Context, Hono, MiddlewareHandler } from 'hono';
import type { DescribeRouteOptions, ResponsesWithResolver } from 'hono-openapi';
import { describeRoute, resolver, validator } from 'hono-openapi';
import { DEFAULTS } from '../config/defaults';
import type {
  ApiRoute,
  ClaimExtractor,
  Logger,
  ObservabilityConfig,
  ProxyRoute,
  RequestContext,
  ServerConfig,
} from '../config/types';
import { extractBearerClaims, extractJwksClaims } from '../middleware/auth';
import { buildRequestContextFromHono, createProxyService } from '../services/proxy';

type HalideVariables = { rawBody?: unknown };

async function resolveSecret(secret: () => string | Promise<string>): Promise<string> {
  return secret();
}

async function createClaimExtractor<TClaims = unknown>(
  config: ServerConfig<TClaims>,
): Promise<ClaimExtractor<TClaims> | undefined> {
  const auth = config.security?.auth;
  if (!auth) return undefined;

  if (auth.strategy === 'jwks' && auth.jwksUri) {
    const { jwksUri, audience } = auth;
    return (c: Context) => extractJwksClaims<TClaims>(c, jwksUri, audience);
  }

  if (auth.secret) {
    const secret = await resolveSecret(auth.secret);
    const audience = auth.audience;
    return (c: Context) => extractBearerClaims<TClaims>(c, secret, audience);
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

  const responses: ResponsesWithResolver = {};

  if (meta?.responses) {
    for (const [status, resp] of Object.entries(meta.responses)) {
      const response: Record<string, unknown> = {
        description: resp.description,
      };
      if (resp.schema) {
        response.content = {
          'application/json': { schema: resolver(resp.schema) },
        };
      }
      responses[status] = response as ResponsesWithResolver[string];
    }
  } else if (meta?.responseSchema) {
    responses['200'] = {
      content: {
        'application/json': { schema: resolver(meta.responseSchema) },
      },
      description: 'Successful response',
    } as ResponsesWithResolver[string];
  } else {
    responses['200'] = { description: 'Successful response' } as ResponsesWithResolver[string];
  }

  options.responses = responses;

  return options;
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

  const getValidJson = (c: Context): unknown =>
    (c.req as unknown as { valid: (t: string) => unknown }).valid('json');

  middlewares.push(async (c: Context) => {
    const start = Date.now();
    let claims: TClaims | undefined;
    let handlerError: Error | undefined;
    let statusCode = 200;

    if (route.access !== 'public' && claimExtractor) {
      const extracted = await claimExtractor(c);
      if (extracted === null) {
        statusCode = 401;
        return c.json({ error: 'Unauthorized' }, 401);
      }
      claims = extracted;
    }

    if (route.authorize) {
      try {
        const body = route.validationSchema ? getValidJson(c) : undefined;
        const ctx = buildRequestContextFromHono(c, body);
        const allowed = await route.authorize(ctx, claims, logger);
        if (!allowed) {
          statusCode = 403;
          return c.json({ error: 'Forbidden' }, 403);
        }
      } catch {
        statusCode = 403;
        return c.json({ error: 'Forbidden' }, 403);
      }
    }

    if (observability?.onRequest && route.observe !== false) {
      const body = route.validationSchema ? getValidJson(c) : undefined;
      const ctx = buildRequestContextFromHono(c, body);
      observability.onRequest(ctx, claims, logger);
    }

    let body: unknown;
    if (route.validationSchema) {
      body = getValidJson(c);
    } else {
      const methodsWithBody = new Set(['POST', 'PUT', 'PATCH']);
      body = methodsWithBody.has(c.req.method.toUpperCase())
        ? await c.req.json().catch(() => undefined)
        : undefined;
    }

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
      if (observability?.onResponse && route.observe !== false) {
        const ctx = buildRequestContextFromHono(c, body);
        observability.onResponse(
          ctx,
          claims,
          {
            durationMs: Date.now() - start,
            error: handlerError,
            statusCode,
          },
          logger,
        );
      }
    }

    return c.json(result);
  });

  const appRecord = app as unknown as Record<
    string,
    (path: string, ...handlers: MiddlewareHandler[]) => void
  >;
  const appMethod = appRecord[method];
  if (appMethod) {
    appMethod(route.path, ...middlewares);
  }
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
      let claims: TClaims | undefined;
      let handlerError: Error | undefined;
      let statusCode = 200;

      let parsedBody: unknown;
      if (route.transform) {
        parsedBody = await c.req.json().catch(() => ({}));
        c.set('rawBody', parsedBody);
      }

      if (route.access !== 'public' && claimExtractor) {
        const extracted = await claimExtractor(c);
        if (extracted === null) {
          statusCode = 401;
          return c.json({ error: 'Unauthorized' }, 401);
        }
        claims = extracted;
      }

      if (route.authorize) {
        try {
          const ctx = buildRequestContextFromHono(c, parsedBody);
          const allowed = await route.authorize(ctx, claims, logger);
          if (!allowed) {
            statusCode = 403;
            return c.json({ error: 'Forbidden' }, 403);
          }
        } catch {
          statusCode = 403;
          return c.json({ error: 'Forbidden' }, 403);
        }
      }

      if (observability?.onRequest && route.observe !== false) {
        const ctx = buildRequestContextFromHono(c, parsedBody);
        observability.onRequest(ctx, claims, logger);
      }

      try {
        const proxyHandler = createProxyService(route, claims, logger, parsedBody);
        return await proxyHandler(c);
      } catch (err) {
        handlerError = err instanceof Error ? err : new Error(String(err));
        statusCode = 500;
        throw err;
      } finally {
        if (observability?.onResponse && route.observe !== false) {
          const ctx = buildRequestContextFromHono(c, parsedBody);
          observability.onResponse(
            ctx,
            claims,
            {
              durationMs: Date.now() - start,
              error: handlerError,
              statusCode,
            },
            logger,
          );
        }
      }
    });
  }
}

export async function registerRoutes<TClaims = unknown>(
  app: Hono<{ Variables: HalideVariables }>,
  config: ServerConfig<TClaims>,
  logger: Logger,
): Promise<void> {
  const claimExtractor = await createClaimExtractor<TClaims>(config);

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

export { buildRequestContextFromHono };
