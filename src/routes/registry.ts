import type { Context, Hono, MiddlewareHandler } from 'hono';
import { describeRoute, validator } from 'hono-openapi';
import { DEFAULTS } from '../config/defaults';
import { buildRequestContextFromHono, createProxyService } from '../services/proxy';
import type { ServerConfig } from '../types';
import type { ApiRoute, ProxyRoute } from '../types/api';
import type { ObservabilityConfig, RequestContext, THalideApp } from '../types/app';
import type { ClaimExtractor } from '../types/security';
import {
  checkAuthorization,
  createClaimExtractor,
  emitOnRequest,
  emitOnResponse,
  extractClaims,
  getValidJson,
  resolveBody,
} from './registry.auth';
import { buildDescribeRouteOptions } from './registry.openapi';

/** Internal Hono variables type. */
type HalideVariables = { rawBody?: unknown };

/** Register a route on the Hono app by calling the method-specific handler (e.g., app.get, app.post). */
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

/** Register an API route with validator, describeRoute, auth, and handler middleware. */
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

/** Register a proxy route with auth, observability, and proxy forwarding for each configured method. */
function registerProxyRoute<TApp = unknown>(
  app: Hono<{ Variables: HalideVariables }>,
  route: ProxyRoute<TApp>,
  claimExtractor: ClaimExtractor<THalideApp<TApp>['claims']> | undefined,
  observability: ObservabilityConfig<TApp> | undefined,
  logger: THalideApp['logger'],
): void {
  for (const method of route.methods) {
    const appRecord = app as unknown as Record<
      string,
      (path: string, ...handlers: MiddlewareHandler[]) => void
    >;
    const appMethod = appRecord[method];
    if (appMethod) {
      appMethod(route.path, describeRoute(buildDescribeRouteOptions(route)), async (c: Context) => {
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
}

/**
 * Register all API and proxy routes on the Hono application.
 *
 * Creates a claim extractor from config and registers each route with auth,
 * observability, and handler middleware.
 *
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
export { resolveOpenApiSpec } from './registry.openapi';
