import type { ServerResponse } from 'node:http';
import { serve } from '@hono/node-server';
import type { Context, Next } from 'hono';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { csrf } from 'hono/csrf';
import { createErrorHandler } from '../middleware/errorHandler';
import type { SpecCacheState } from '../middleware/openapi';
import { createOpenApiRoutes } from '../middleware/openapi';
import { createRateLimitMiddleware, createRedisRateLimitStore } from '../middleware/rateLimit';
import { createRequestIdMiddleware } from '../middleware/requestId';
import { createSecurityMiddleware } from '../middleware/security';
import { createAppHandler } from '../routes/app';
import { registerRoutes } from '../routes/registry';
import { createAgentCache } from '../services/proxy';
import type { AppConfig, HalideVariables, Logger, RequestContext } from '../types/app';
import type { ServerConfig } from '../types/server-config';
import { asInternalLogger, createDefaultLogger, DEFAULTS } from './defaults';
import { validateServerConfig, validateServerConfigSync } from './validate';

/**
 * Halide HTTP server with lifecycle management.
 * Created by {@link createServer}. Call `start()` to begin listening and `stop()` to shut down gracefully.
 */
export interface Server {
  /** Promise that resolves when the server is ready to accept connections. */
  ready: Promise<void>;
  /**
   * Start the server and begin listening on the configured port.
   * @param onReady - Optional callback invoked with the port when the server starts.
   */
  start: (onReady?: (port: number) => void) => void;
  /** Stop the server and close all connections. */
  stop: () => Promise<void>;
}

/**
 * Result of {@link createApp}, containing the Hono app and cleanup functions.
 * Call `proxyDispose()` and `rateLimitDispose()` when shutting down to release resources.
 */
export interface CreateAppResult {
  /** The configured Hono application. */
  app: Hono<{ Variables: HalideVariables }>;
  /** Logger instance used throughout the server. */
  logger: Logger<unknown>;
  /** Function to dispose of proxy HTTP agent connections. */
  proxyDispose: (() => void) | undefined;
  /** Function to dispose of rate limit resources. */
  rateLimitDispose: (() => void) | undefined;
}

/**
 * Apply CORS and optional CSRF middleware to the Hono app.
 * @internal
 */
export function setupCorsAndCsrf<TClaims, TLogScope>(
  app: Hono<{ Variables: HalideVariables }>,
  config: ServerConfig<TClaims, TLogScope>,
): void {
  const security = config.security;
  const corsConfig = security?.cors;
  const corsMethods = corsConfig?.methods ?? DEFAULTS.cors.methods;
  const corsOrigin = corsConfig?.origin ?? DEFAULTS.cors.origin;
  const corsCredentials = corsConfig?.credentials ?? DEFAULTS.cors.credentials;

  app.use(
    '*',
    cors({
      allowHeaders: corsConfig?.allowedHeaders,
      allowMethods: corsMethods.map((m: string) => m.toUpperCase()),
      credentials: corsCredentials,
      exposeHeaders: corsConfig?.exposedHeaders,
      maxAge: corsConfig?.maxAge,
      origin: corsOrigin,
    }),
  );

  if (corsCredentials) {
    const origins = Array.isArray(corsOrigin) ? corsOrigin : [corsOrigin];
    app.use('*', csrf({ origin: origins }));
  }
}

/**
 * Apply rate limiting middleware to the Hono app.
 * @internal
 */
export function setupRateLimit<TClaims, TLogScope>(
  app: Hono<{ Variables: HalideVariables }>,
  security: ServerConfig<TClaims, TLogScope>['security'],
): (() => void) | undefined {
  if (!security?.rateLimit) return undefined;

  const rl = security.rateLimit;
  let middleware: (c: Context, next: Next) => Promise<Response | undefined>;
  let dispose: (() => void) | undefined;

  if (rl.redisClient) {
    const { middleware: redisMw, dispose: redisDispose } = createRedisRateLimitStore(
      rl.redisClient,
      {
        maxRequests: rl.maxRequests ?? DEFAULTS.rateLimit.maxRequests,
        trustedProxies: rl.trustedProxies,
        windowMs: rl.windowMs ?? DEFAULTS.rateLimit.windowMs,
      },
    );
    middleware = redisMw;
    dispose = redisDispose;
  } else {
    const { middleware: memMw, dispose: memDispose } = createRateLimitMiddleware({
      maxEntries: rl.maxEntries,
      maxRequests: rl.maxRequests ?? DEFAULTS.rateLimit.maxRequests,
      trustedProxies: rl.trustedProxies,
      windowMs: rl.windowMs ?? DEFAULTS.rateLimit.windowMs,
    });
    middleware = memMw;
    dispose = memDispose;
  }

  app.use('*', middleware);
  return dispose;
}

/**
 * Apply CSP overrides for OpenAPI/Swagger routes when OpenAPI is enabled.
 * @internal
 */
export function setupOpenapi<TClaims, TLogScope>(
  app: Hono<{ Variables: HalideVariables }>,
  config: ServerConfig<TClaims, TLogScope>,
  logger: Logger<Record<string, unknown>>,
): void {
  const openapiEnabled = config.openapi?.enabled ?? false;
  if (!openapiEnabled) return;

  const appName = config.app?.name ?? DEFAULTS.app.name;
  const security = config.security;
  const cspOverrides = DEFAULTS.csp.openapiOverrides;
  const swaggerPath = config.openapi?.path ?? DEFAULTS.openapi.path;

  logger.warn(
    { appName },
    `OpenAPI UI is enabled. Swagger routes use relaxed CSP directives; custom CSP settings do not apply to these routes. This should be disabled in production.`,
  );

  app.use(swaggerPath, createSecurityMiddleware(security?.csp ?? {}, cspOverrides));
  app.use(`${swaggerPath}/*`, createSecurityMiddleware(security?.csp ?? {}, cspOverrides));
}

/**
 * Apply CSP security headers middleware to the Hono app.
 * @internal
 */
export function setupSecurity<TClaims, TLogScope>(
  app: Hono<{ Variables: HalideVariables }>,
  config: ServerConfig<TClaims, TLogScope>,
): void {
  app.use('*', createSecurityMiddleware(config.security?.csp ?? {}));
}

/**
 * Apply request ID middleware when `observability.requestId` is enabled.
 * @internal
 */
export function setupRequestId<TClaims, TLogScope>(
  app: Hono<{ Variables: HalideVariables }>,
  config: ServerConfig<TClaims, TLogScope>,
): void {
  if (config.observability?.requestId) {
    app.use('*', createRequestIdMiddleware());
  }
}

function setupRoutes<TClaims = unknown, TLogScope = unknown>(
  app: Hono<{ Variables: HalideVariables }>,
  agentCache: ReturnType<typeof createAgentCache>,
  config: ServerConfig<TClaims, TLogScope>,
  logger: Logger<TLogScope>,
): void {
  registerRoutes({ agentCache, app, config, logger });
}

function setupOpenapiRoutes<TClaims = unknown, TLogScope = unknown>(
  config: ServerConfig<TClaims, TLogScope>,
  app: Hono,
  specCacheState: SpecCacheState,
  logger?: Logger<TLogScope>,
): void {
  createOpenApiRoutes(config, app, specCacheState, logger);
}

/**
 * Apply SPA fallback and static file handler when `config.app.root` is set.
 * @internal
 */
export function setupAppHandler<TClaims, TLogScope>(
  app: Hono<{ Variables: HalideVariables }>,
  config: ServerConfig<TClaims, TLogScope>,
): void {
  if (!config.app?.root) return;

  const { cspMiddleware, staticMiddleware, appFallback } = createAppHandler(
    config.app as AppConfig & { root: string },
    config.security?.csp,
  );
  app.get('/*', cspMiddleware, staticMiddleware);
  app.all('/*', cspMiddleware, appFallback);
}

/**
 * Apply the global error handler middleware to the Hono app.
 * @internal
 */
export function setupErrorHandling<TClaims, TLogScope>(
  app: Hono<{ Variables: HalideVariables }>,
  logger: Logger<TLogScope>,
  logScopeFactory: ((ctx: RequestContext, claims: TClaims | undefined) => TLogScope) | undefined,
): void {
  app.onError(createErrorHandler<TClaims, TLogScope>(logger, logScopeFactory));
}

/**
 * Create a configured Hono application with all middleware, routes, and handlers.
 *
 * This is the core function that builds the server. It validates the config,
 * applies middleware, registers routes, and sets up the SPA fallback handler.
 *
 * @typeParam TClaims - The type of the decoded JWT claims.
 * @typeParam TLogScope - The type of the structured log scope object.
 * @param config - The server configuration.
 * @returns An object containing the Hono app and cleanup functions.
 */
export function createApp<TClaims = unknown, TLogScope = unknown>(
  config: ServerConfig<TClaims, TLogScope>,
): CreateAppResult {
  const logger = config.observability?.logger ?? createDefaultLogger();
  const internalLogger = asInternalLogger(logger);
  const logScopeFactory = config.observability?.logScopeFactory;
  const auth = config.security?.auth;
  const hasFunctionSecret = auth?.secret && typeof auth.secret === 'function';

  if (hasFunctionSecret) {
    void validateServerConfig(config).then((result) => {
      if (!result.valid) {
        internalLogger.error(
          { errors: result.errors },
          'Async auth secret validation failed at startup:',
          result.errors.map((e) => e.message).join(', '),
        );
        process.exit(1);
      }
    });
  } else {
    validateServerConfigSync(config, logger as Logger<unknown>);
  }

  const app = new Hono<{ Variables: HalideVariables }>();
  const agentCache = createAgentCache();

  setupCorsAndCsrf(app, config);
  const rateLimitDispose = setupRateLimit(app, config.security);
  setupOpenapi(app, config, internalLogger);
  setupSecurity(app, config);
  setupRequestId(app, config);
  setupRoutes(app, agentCache, config, logger);

  const specCacheState: SpecCacheState = { cachedSpec: null, specResolution: null };
  setupOpenapiRoutes(config, app as unknown as Hono, specCacheState, logger);

  setupAppHandler(app, config);
  setupErrorHandling(app, logger, logScopeFactory);

  return {
    app,
    logger: logger as Logger<unknown>,
    proxyDispose: () => agentCache.dispose(),
    rateLimitDispose,
  };
}

/**
 * Create a fully-configured Halide server with lifecycle management.
 *
 * The server is synchronous to create. Call `server.start()` to listen.
 * Graceful shutdown is handled automatically on SIGINT/SIGTERM.
 *
 * @typeParam TClaims - The type of the decoded JWT claims.
 * @typeParam TLogScope - The type of the structured log scope object.
 * @param configInput - The server configuration.
 * @returns A `Server` object with `ready`, `start`, and `stop` methods.
 * @example
 * ```ts
 * import { defineHalide } from 'halide';
 *
 * const { createServer, apiRoute } = defineHalide();
 *
 * const server = createServer({
 *   apiRoutes: [
 *     apiRoute({
 *       access: 'public',
 *       handler: async () => ({ status: 'ok' }),
 *       path: '/health',
 *     }),
 *   ],
 * });
 *
 * server.start();
 * ```
 */
export function createServer<TClaims = unknown, TLogScope = unknown>(
  configInput: ServerConfig<TClaims, TLogScope>,
): Server {
  const { app, proxyDispose, rateLimitDispose, logger } = createApp<TClaims, TLogScope>(
    configInput,
  );

  const appName = configInput.app?.name ?? DEFAULTS.app.name;

  let httpServer: ReturnType<typeof serve> | undefined;
  let isShuttingDown = false;
  let readyResolve!: () => void;
  let readyReject!: (err: Error) => void;

  const activeRequests = new Set<ServerResponse>();

  const ready = new Promise<void>((resolve, reject) => {
    readyResolve = resolve;
    readyReject = reject;
  });

  void ready.catch(() => {});

  /** Dispose proxy/rate-limit resources, drain active connections, and close the HTTP server. */
  const shutdownServer = async (exitCode?: number): Promise<void> => {
    rateLimitDispose?.();
    proxyDispose?.();
    const server = httpServer;
    if (server) {
      const http = server as import('node:http').Server;
      http.closeAllConnections?.();
      http.close();
      await new Promise<void>((resolve) => {
        const checkDrain = (): void => {
          if (activeRequests.size === 0) {
            resolve();
          } else {
            setTimeout(checkDrain, 100);
          }
        };
        checkDrain();
      });
    }
    if (exitCode !== undefined) {
      process.exitCode = exitCode;
    }
  };

  /** Handle SIGINT/SIGTERM: set shutdown flag, log the signal, and drain connections. */
  const shutdown = async (signal: string): Promise<void> => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    logger.info({ appName }, `Received ${signal}, shutting down...`);
    await shutdownServer(0);
  };

  return {
    ready,
    start: (onReady?: (port: number) => void) => {
      if (httpServer) return;
      const port =
        Number.parseInt(process.env.PORT || '', 10) || (configInput.app?.port ?? DEFAULTS.app.port);
      logger.info({ appName }, `Server starting on port ${port}`);
      httpServer = serve(
        {
          fetch: app.fetch,
          port,
        },
        () => {
          readyResolve();
          onReady?.(port);
        },
      );
      const http = httpServer as import('node:http').Server;
      http.on('request', (_req, res) => {
        activeRequests.add(res);
        res.on('finish', () => activeRequests.delete(res));
        res.on('close', () => activeRequests.delete(res));
      });
      httpServer.on('error', (err: Error) => {
        readyReject(err);
        logger.error({ appName }, `Failed to start: ${err.message}`);
      });
      process.on('SIGINT', () => {
        void shutdown('SIGINT');
      });
      process.on('SIGTERM', () => {
        void shutdown('SIGTERM');
      });
    },
    stop: async () => {
      if (isShuttingDown) return;
      isShuttingDown = true;
      if (!httpServer) return;
      await shutdownServer();
    },
  };
}
