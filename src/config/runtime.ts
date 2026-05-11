import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createErrorHandler } from '../middleware/errorHandler.js';
import { createRateLimitMiddleware } from '../middleware/rateLimit.js';
import { createRequestIdMiddleware } from '../middleware/requestId.js';
import { createSecurityMiddleware } from '../middleware/security.js';
import { createOpenApiRoutes } from '../middleware/swagger.js';
import { createAppHandler } from '../routes/app.js';
import { registerRoutes } from '../routes/registry.js';
import type { AppConfig, ServerConfig } from '../types.js';
import { createNoopLogger, DEFAULTS } from './defaults.js';
import { validateServerConfig } from './validate.js';

/** Hono context variables used internally by Halide middleware. */
type HalideVariables = { rawBody?: unknown };

/**
 * Halide HTTP server with lifecycle management.
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
 * Result of createApp, containing the Hono app and cleanup functions.
 */
export interface CreateAppResult {
  /** The configured Hono application. */
  app: Hono<{ Variables: HalideVariables }>;
  /** Function to dispose of rate limit resources. */
  rateLimitDispose: (() => void) | undefined;
}

/**
 * Create a configured Hono application with all middleware, routes, and handlers.
 *
 * This is the core function that builds the server. It validates the config,
 * applies middleware, registers routes, and sets up the SPA fallback handler.
 *
 * @typeParam TApp - The bundled app context type combining claims and logger.
 * @param configInput - The server configuration.
 * @returns An object containing the Hono app and cleanup functions.
 */
export function createApp<TApp = unknown>(configInput: ServerConfig<TApp>): CreateAppResult {
  validateServerConfig(configInput);

  const logger = configInput.observability?.logger ?? createNoopLogger();
  const app = new Hono<{ Variables: HalideVariables }>();

  const appName = configInput.app?.name ?? DEFAULTS.app.name;
  const security = configInput.security;
  const corsConfig = security?.cors;
  const corsMethods = corsConfig?.methods ?? DEFAULTS.cors.methods;
  const corsOrigin = corsConfig?.origin ?? DEFAULTS.cors.origin;
  const corsCredentials = corsConfig?.credentials ?? DEFAULTS.cors.credentials;

  app.use(
    '*',
    cors({
      allowHeaders: corsConfig?.allowedHeaders,
      allowMethods: corsMethods.map((m) => m.toUpperCase()),
      credentials: corsCredentials,
      exposeHeaders: corsConfig?.exposedHeaders,
      maxAge: corsConfig?.maxAge,
      origin: corsOrigin,
    }),
  );

  if (corsOrigin === '*' || (Array.isArray(corsOrigin) && corsOrigin.includes('*'))) {
    logger.warn(
      { appName } as unknown,
      `CORS wildcard origin detected. Consider restricting origins for production use.`,
    );
  }

  let rateLimitDispose: (() => void) | undefined;

  if (security?.rateLimit) {
    const rateLimitConfig = security.rateLimit;
    const { middleware, dispose } = createRateLimitMiddleware({
      maxEntries: rateLimitConfig.maxEntries,
      maxRequests: rateLimitConfig.maxRequests ?? DEFAULTS.rateLimit.maxRequests,
      trustedProxies: rateLimitConfig.trustedProxies,
      windowMs: rateLimitConfig.windowMs ?? DEFAULTS.rateLimit.windowMs,
    });
    app.use('*', middleware);
    rateLimitDispose = dispose;
  }

  const openapiEnabled = configInput.openapi?.enabled ?? false;

  if (openapiEnabled) {
    logger.warn(
      { appName } as unknown,
      `OpenAPI UI is enabled. Swagger routes use relaxed CSP directives; custom CSP settings do not apply to these routes. This should be disabled in production.`,
    );
    const cspOverrides = DEFAULTS.csp.openapiOverrides as unknown as Partial<
      import('../types.js').CspDirectives
    >;
    const swaggerPath = configInput.openapi?.path ?? DEFAULTS.openapi.path;
    app.use(swaggerPath, createSecurityMiddleware(security?.csp ?? {}, cspOverrides));
    app.use(`${swaggerPath}/*`, createSecurityMiddleware(security?.csp ?? {}, cspOverrides));
  }

  app.use('*', createSecurityMiddleware(security?.csp ?? {}));

  if (configInput.observability?.requestId) {
    app.use('*', createRequestIdMiddleware());
  }

  registerRoutes(app, configInput, logger);

  createOpenApiRoutes(configInput, app as unknown as Hono);

  if (configInput.app?.root) {
    const { staticMiddleware, appFallback } = createAppHandler(
      configInput.app as AppConfig & { root: string },
    );
    app.get('/*', staticMiddleware);
    app.all('/*', appFallback);
  }

  app.onError(createErrorHandler(logger));

  return { app, rateLimitDispose };
}

/**
 * Create a fully-configured Halide server with lifecycle management.
 *
 * The server is synchronous to create. Call `server.start()` to listen.
 * Graceful shutdown is handled automatically on SIGINT/SIGTERM.
 *
 * @typeParam TApp - The bundled app context type combining claims and logger.
 * @param configInput - The server configuration.
 * @returns A `Server` object with `ready`, `start`, and `stop` methods.
 * @example
 * ```ts
 * import { createServer, apiRoute } from 'halide';
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
 * server.start((port) => {
 *   console.log(`Server running on port ${port}`);
 * });
 * ```
 */
export function createServer<TApp = unknown>(configInput: ServerConfig<TApp>): Server {
  const { app, rateLimitDispose } = createApp<TApp>(configInput);

  const logger = configInput.observability?.logger ?? createNoopLogger();
  const appName = configInput.app?.name ?? DEFAULTS.app.name;

  let httpServer: ReturnType<typeof serve> | undefined;
  let isShuttingDown = false;
  let readyResolve!: () => void;
  let readyReject!: (err: Error) => void;

  const ready = new Promise<void>((resolve, reject) => {
    readyResolve = resolve;
    readyReject = reject;
  });

  void ready.catch(() => {});

  /** Gracefully shut down the server on SIGINT/SIGTERM. */
  const shutdown = async (signal: string): Promise<void> => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    logger.info({ appName } as unknown, `Received ${signal}, shutting down...`);
    rateLimitDispose?.();
    const server = httpServer;
    if (server) {
      (server as import('node:http').Server).closeAllConnections?.();
      await new Promise<void>((resolve, reject) => {
        server.close((err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
    }
    process.exitCode = 0;
  };

  return {
    ready,
    start: (onReady?: (port: number) => void) => {
      if (httpServer) return;
      const port =
        Number.parseInt(process.env.PORT || '', 10) || (configInput.app?.port ?? DEFAULTS.app.port);
      logger.info({ appName } as unknown, `Server starting on port ${port}`);
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
      httpServer.on('error', (err: Error) => {
        readyReject(err);
        logger.error({ appName } as unknown, `Failed to start: ${err.message}`);
        process.exit(1);
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
      rateLimitDispose?.();
      const server = httpServer;
      if (!server) {
        return;
      }
      (server as import('node:http').Server).closeAllConnections?.();
      await new Promise<void>((resolve, reject) => {
        server.close((err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
    },
  };
}
