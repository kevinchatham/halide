import type { Hono, MiddlewareHandler } from 'hono';
import type { createAgentCache } from '../services/proxy';
import type { HalideContext, HalideVariables, THalideApp } from '../types/app';
import type { ServerConfig } from '../types/server-config';
import { registerApiRoute as registerApiRouteFn } from './registry.api';
import {
  type ClaimExtractorCache,
  createClaimExtractor,
  NOOP_EXTRACTOR_CACHE,
} from './registry.auth';
import { registerProxyRoute as registerProxyRouteFn } from './registry.proxy';

export { registerApiRouteFn as registerApiRoute, registerProxyRouteFn as registerProxyRoute };

/** Hono method types that have direct app.* methods on the Hono app instance. */
export type HonoMethod = 'get' | 'post' | 'put' | 'patch' | 'delete' | 'options';

/** Register a route on the Hono app by calling the method-specific handler (e.g., app.get, app.post). */
export function registerRouteOnApp(
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
export function registerRoutes<TApp extends HalideContext = HalideContext>(
  app: Hono<{ Variables: HalideVariables }>,
  config: ServerConfig<TApp>,
  logger: THalideApp['logger'],
  agentCache: ReturnType<typeof createAgentCache>,
  claimExtractorCache: ClaimExtractorCache = NOOP_EXTRACTOR_CACHE,
): void {
  const claimExtractor = createClaimExtractor<TApp>(config, logger, claimExtractorCache);

  if (config.apiRoutes) {
    for (const route of config.apiRoutes) {
      registerApiRouteFn(app, route, claimExtractor, config.observability, logger);
    }
  }

  if (config.proxyRoutes) {
    for (const route of config.proxyRoutes) {
      registerProxyRouteFn(app, route, claimExtractor, config.observability, logger, agentCache);
    }
  }
}
