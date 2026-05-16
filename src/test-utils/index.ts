import { Hono } from 'hono';
import { createNoopLogger } from '../config/defaults';
import {
  setupAppHandler,
  setupCorsAndCsrf,
  setupErrorHandling,
  setupRateLimit,
  setupRequestId,
  setupSecurity,
} from '../config/runtime';
import { createOpenApiRoutes } from '../middleware/openapi';
import { registerRoutes } from '../routes/registry';
import { createAgentCache } from '../services/proxy';
import type { HalideVariables, Logger } from '../types/app';
import type { ServerConfig } from '../types/server-config';

/** Logger instance that discards all log messages, used for testing. */
export const noopLogger: Logger<unknown> = createNoopLogger();

/**
 * Options for configuring which middleware pipelines `createTestApp` applies.
 * All flags default to `false` for backward compatibility with existing tests.
 *
 * Use these flags to selectively enable middleware during testing without
 * configuring them in the server config.
 */
export type TestAppOptions = {
  /** Apply CORS + CSRF middleware (default: false) */
  cors?: boolean;
  /** Apply CSP security headers (default: false) */
  csp?: boolean;
  /** Apply rate limiting middleware (default: false) */
  rateLimit?: boolean;
  /** Apply request ID middleware (default: false) */
  requestId?: boolean;
  /** Apply global error handler (default: false) */
  errorHandler?: boolean;
  /** Apply SPA fallback + static file handler (default: false) */
  appHandler?: boolean;
  /** Logger override — defaults to noopLogger */
  logger?: Logger<unknown>;
};

const rateLimitDisposeMap = new WeakMap<Hono<{ Variables: HalideVariables }>, () => void>();

/**
 * Retrieve and invoke the rate limit dispose function stored for a test app.
 *
 * When `createTestApp` is called with `{ rateLimit: true }`, the rate limit
 * middleware's dispose function is stored internally so tests can clean up
 * resources after they finish. This helper retrieves and calls it.
 *
 * @param app - The Hono app returned by `createTestApp`.
 * @returns `true` if a dispose function was found and invoked, `false` otherwise.
 */
export function disposeRateLimit(app: Hono<{ Variables: HalideVariables }>): boolean {
  const dispose = rateLimitDisposeMap.get(app);
  if (dispose) {
    dispose();
    rateLimitDisposeMap.delete(app);
    return true;
  }
  return false;
}

/**
 * Create a Hono application configured with routes and OpenAPI routes for testing.
 *
 * Registers all routes from config and adds OpenAPI documentation routes.
 * Uses a noop logger so tests don't produce log output.
 *
 * When `options.rateLimit` is enabled, call `disposeRateLimit(app)` after tests
 * complete to release rate limit resources.
 *
 * @param config - The server configuration containing routes.
 * @param options - Optional middleware configuration flags.
 * @returns A Hono app with routes registered but not started.
 */
export function createTestApp<TClaims = unknown, TLogScope = unknown>(
  config: ServerConfig<TClaims, TLogScope>,
  options?: TestAppOptions,
): Hono<{ Variables: HalideVariables }> {
  const app = new Hono<{ Variables: HalideVariables }>();
  const agentCache = createAgentCache();
  const logger = options?.logger ?? noopLogger;

  if (options?.cors) {
    setupCorsAndCsrf(app, config);
  }
  if (options?.rateLimit) {
    const dispose = setupRateLimit(app, config.security);
    if (dispose) {
      rateLimitDisposeMap.set(app, dispose);
    }
  }
  if (options?.csp) {
    setupSecurity(app, config);
  }
  if (options?.requestId) {
    setupRequestId(app, config);
  }
  if (options?.appHandler) {
    setupAppHandler(app, config);
  }
  if (options?.errorHandler) {
    setupErrorHandling(
      app,
      logger,
      options.logger ? undefined : config.observability?.logScopeFactory,
    );
  }

  registerRoutes({ agentCache, app, config, logger: noopLogger });
  createOpenApiRoutes(config, app);

  return app;
}
