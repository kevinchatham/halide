import type { Context, Hono, MiddlewareHandler } from 'hono';
import { describeRoute, validator } from 'hono-openapi';
import { DEFAULTS } from '../config/defaults';
import type { AgentCache } from '../services/proxy';
import { buildRequestContextFromHono, createProxyService } from '../services/proxy';
import type { ApiRoute, ProxyRoute } from '../types/api';
import type {
  HalideVariables,
  ObservabilityConfig,
  RequestContext,
  THalideApp,
} from '../types/app';
import type { ClaimExtractor } from '../types/security';
import type { ServerConfig } from '../types/server-config';
import { resolveBody } from './body.js';
import {
  checkAuthorization,
  createClaimExtractor,
  emitOnRequest,
  emitOnResponse,
  extractClaims,
  NOOP_EXTRACTOR_CACHE,
} from './registry.auth';
import { buildDescribeRouteOptions } from './registry.openapi';

/** Hono method types that have direct app.* methods on the Hono app instance. */
type HonoMethod = 'get' | 'post' | 'put' | 'patch' | 'delete' | 'options';

/** Register a route on the Hono app by calling the method-specific handler (e.g., app.get, app.post). */
function registerRouteOnApp(
  app: Hono<{ Variables: HalideVariables }>,
  method: string,
  path: string,
  ...handlers: MiddlewareHandler[]
): void {
  if (method === 'head') {
    (app.on as (method: string, path: string, ...handlers: MiddlewareHandler[]) => void)(
      'HEAD',
      path,
      ...handlers,
    );
  } else {
    (app[method as HonoMethod] as (path: string, ...handlers: MiddlewareHandler[]) => void)(
      path,
      ...handlers,
    );
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

    const authBody = route.requestSchema ? resolveBody(c, route) : undefined;
    const appCtx: TApp = { claims, logger } as TApp;
    const forbidResponse = await checkAuthorization(c, route, appCtx, authBody);
    if (forbidResponse) return forbidResponse;

    emitOnRequest(c, authBody, appCtx, observability, route.observe, logger);

    const body = await resolveBody(c, route);

    let result: unknown;
    try {
      const ctx = buildRequestContextFromHono(c, body) as RequestContext & { body: unknown };
      ctx.body = body;
      result = await route.handler(ctx, appCtx);
    } catch (err) {
      handlerError = err instanceof Error ? err : new Error(String(err));
      statusCode = 500;
      throw err;
    } finally {
      emitOnResponse(
        c,
        body,
        appCtx,
        observability,
        route.observe,
        { handlerError, start, statusCode },
        result,
        logger,
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
  agentCache: AgentCache,
): void {
  for (const method of route.methods) {
    registerRouteOnApp(
      app,
      method,
      route.path,
      describeRoute(buildDescribeRouteOptions(route)),
      async (c: Context) => {
        const start = Date.now();
        let handlerError: Error | undefined;
        let pipeError: Error | undefined;
        let statusCode = 200;
        let proxyResponseBody: unknown;

        let parsedBody: unknown;
        if (route.transform) {
          parsedBody = await c.req.json().catch(() => ({}));
          c.set('rawBody', parsedBody);
        }

        const { claims, response: authResponse } = await extractClaims(c, route, claimExtractor);
        if (authResponse) return authResponse;

        const appCtx: TApp = { claims, logger } as TApp;
        const forbidResponse = await checkAuthorization(c, route, appCtx, parsedBody);
        if (forbidResponse) return forbidResponse;

        emitOnRequest(c, parsedBody, appCtx, observability, route.observe, logger);

        try {
          const proxyHandler = createProxyService(route, appCtx, agentCache, parsedBody);
          const response = await proxyHandler(c);
          statusCode = response.status;

          if (route.observe === false) {
            return response;
          }

          const body = response.body;
          if (body) {
            const { readable, writable } = new TransformStream();
            const reader = body.getReader();
            const writer = writable.getWriter();
            const collected: Uint8Array[] = [];
            const maxCollect = observability?.maxCollect ?? 1024;
            let collectedBytes = 0;

            async function pipe(): Promise<void> {
              try {
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  if (collectedBytes < maxCollect && value) {
                    const slice = value.slice(0, Math.max(0, maxCollect - collectedBytes));
                    collected.push(slice);
                    collectedBytes += slice.length;
                  }
                  await writer.write(value);
                }
                await writer.close();
              } catch (err) {
                pipeError = err instanceof Error ? err : new Error(String(err));
                await writer.close();
              }
            }

            const pipePromise = pipe();

            const responseBodyText =
              collected.length > 0
                ? await new Response(new Blob(collected as BlobPart[])).text()
                : undefined;

            await pipePromise;

            proxyResponseBody = responseBodyText;
            const responseInit: ResponseInit = {
              headers: response.headers,
              status: response.status,
            };
            return new Response(readable as ReadableStream<Uint8Array>, responseInit);
          }

          return response;
        } catch (err) {
          handlerError = err instanceof Error ? err : new Error(String(err));
          statusCode = 500;
          throw err;
        } finally {
          if (pipeError && !handlerError) {
            handlerError = pipeError;
            statusCode = 502;
          }
          emitOnResponse(
            c,
            parsedBody,
            appCtx,
            observability,
            route.observe,
            { handlerError, start, statusCode },
            proxyResponseBody,
            logger,
          );
        }
      },
    );
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
 * @param agentCache - The HTTP agent cache for proxy connections.
 * @param claimExtractorCache - The claim extractor cache instance.
 */
export function registerRoutes<TApp = unknown>(
  app: Hono<{ Variables: HalideVariables }>,
  config: ServerConfig<TApp>,
  logger: THalideApp['logger'],
  agentCache: AgentCache,
  claimExtractorCache: import('./registry.auth').ClaimExtractorCache = NOOP_EXTRACTOR_CACHE,
): void {
  const claimExtractor = createClaimExtractor<TApp>(config, logger, claimExtractorCache);

  if (config.apiRoutes) {
    for (const route of config.apiRoutes) {
      registerApiRoute(app, route, claimExtractor, config.observability, logger);
    }
  }

  if (config.proxyRoutes) {
    for (const route of config.proxyRoutes) {
      registerProxyRoute(app, route, claimExtractor, config.observability, logger, agentCache);
    }
  }
}
