import type { Hono, MiddlewareHandler } from 'hono';
import type { createAgentCache } from '../services/proxy';
import type {
  AnyHalideContext,
  AppLogger,
  AppLogScope,
  HalideContext,
  HalideVariables,
} from '../types/app';
import type { ServerConfig } from '../types/server-config';
import { registerApiRoute as registerApiRouteFn } from './registry.api';
import {
  type ClaimExtractorCache,
  createClaimExtractor,
  NOOP_EXTRACTOR_CACHE,
} from './registry.auth';
import { registerProxyRoute as registerProxyRouteFn } from './registry.proxy';

export { registerApiRouteFn as registerApiRoute, registerProxyRouteFn as registerProxyRoute };

/**
 * Hono method types that have direct app.* methods on the Hono app instance.
 * HEAD is handled separately via `app.on('HEAD', ...)`.
 */
export type HonoMethod = 'get' | 'post' | 'put' | 'patch' | 'delete' | 'options';

/**
 * Register a route on the Hono app by calling the method-specific handler (e.g., app.get, app.post).
 * HEAD requests use `app.on('HEAD', ...)` since Hono has no dedicated `app.head()` method.
 * @param app - The Hono application to register the route on.
 * @param method - The HTTP method. 'head' is mapped to `app.on('HEAD', ...)`.
 * @param path - The URL path pattern for this route.
 * @param handlers - One or more middleware handlers to execute for this route.
 */
export function registerRouteOnApp(
  app: Hono<{ Variables: HalideVariables }>,
  method: HonoMethod | 'head',
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
    (app[method] as (path: string, ...handlers: MiddlewareHandler[]) => void)(path, ...handlers);
  }
}

/**
 * Options for {@link registerRoutes}.
 * @typeParam TApp - The bundled app context type combining claims and logger.
 */
export type RegisterRoutesOptions<TApp extends AnyHalideContext = HalideContext> = {
  /** The Hono application to register routes on. */
  app: Hono<{ Variables: HalideVariables }>;
  /** The server configuration containing routes and observability settings. */
  config: ServerConfig<TApp>;
  /** Logger instance for observability. */
  logger: AppLogger<TApp>;
  /** The HTTP agent cache for proxy connections. */
  agentCache: ReturnType<typeof createAgentCache>;
  /** The claim extractor cache instance. Optional — defaults to a no-op cache. */
  claimExtractorCache?: ClaimExtractorCache;
};

/**
 * Register all API and proxy routes on the Hono application.
 *
 * Creates a claim extractor from config and registers each route with auth,
 * observability, and handler middleware. When `logScopeFactory` is configured
 * in `observability`, the factory is passed through to the auth middleware
 * so that every logger call within a request automatically receives the
 * per-request scope.
 *
 * @typeParam TApp - The bundled app context type combining claims and logger.
 * @param options - The registration options.
 */
export function registerRoutes<TApp extends AnyHalideContext = HalideContext>(
  options: RegisterRoutesOptions<TApp>,
): void {
  const { app, config, logger, agentCache, claimExtractorCache = NOOP_EXTRACTOR_CACHE } = options;
  const logScopeFactory = config.observability?.logScopeFactory as
    | ((ctx: import('../types/app').RequestContext, app: TApp) => AppLogScope<TApp>)
    | undefined;

  const claimExtractor = createClaimExtractor<TApp>(config, logger, claimExtractorCache);

  if (config.apiRoutes) {
    for (const route of config.apiRoutes) {
      registerApiRouteFn(app, route, claimExtractor, config.observability, logger, logScopeFactory);
    }
  }

  if (config.proxyRoutes) {
    for (const route of config.proxyRoutes) {
      registerProxyRouteFn(
        app,
        route,
        claimExtractor,
        config.observability,
        logger,
        agentCache,
        logScopeFactory,
      );
    }
  }
}
