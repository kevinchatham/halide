import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createErrorHandler } from '../middleware/errorHandler.js';
import { createRateLimitMiddleware } from '../middleware/rateLimit.js';
import { createRequestIdMiddleware } from '../middleware/requestId.js';
import { createSecurityMiddleware } from '../middleware/security.js';
import { createOpenApiRoutes } from '../middleware/swagger.js';
import { registerRoutes } from '../routes/registry.js';
import { createSpaHandler } from '../routes/spa.js';
import type { ServerConfig } from '../types.js';
import { createNoopLogger, DEFAULTS } from './defaults.js';
import { validateServerConfig } from './validate.js';

type HalideVariables = { rawBody?: unknown };

export interface Server {
  ready: Promise<void>;
  start: (onReady?: (port: number) => void) => void;
  stop: () => Promise<void>;
}

export interface CreateAppResult {
  app: Hono<{ Variables: HalideVariables }>;
  rateLimitDispose: (() => void) | undefined;
}

export function createApp<TClaims = unknown>(configInput: ServerConfig<TClaims>): CreateAppResult {
  validateServerConfig(configInput);

  const logger = configInput.observability?.logger ?? createNoopLogger();
  const app = new Hono<{ Variables: HalideVariables }>();

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

  let rateLimitDispose: (() => void) | undefined;

  if (security?.rateLimit) {
    const rateLimitConfig = security.rateLimit;
    const { middleware, dispose } = createRateLimitMiddleware({
      maxRequests: rateLimitConfig.maxRequests ?? DEFAULTS.rateLimit.maxRequests,
      windowMs: rateLimitConfig.windowMs ?? DEFAULTS.rateLimit.windowMs,
    });
    app.use('*', middleware);
    rateLimitDispose = dispose;
  }

  const openapiEnabled = configInput.openapi?.enabled ?? false;

  if (openapiEnabled) {
    logger.warn(
      `[${
        configInput.spa.name ?? DEFAULTS.spa.name
      }] OpenAPI UI is enabled. Swagger routes use relaxed CSP directives; custom CSP settings do not apply to these routes. This should be disabled in production.`,
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

  registerRoutes<TClaims>(app, configInput, logger);

  createOpenApiRoutes(configInput, app as unknown as Hono);

  const { staticMiddleware, spaFallback } = createSpaHandler(configInput.spa);
  app.get('/*', staticMiddleware);
  app.all('/*', spaFallback);

  app.onError(createErrorHandler(logger));

  return { app, rateLimitDispose };
}

export function createServer<TClaims = unknown>(configInput: ServerConfig<TClaims>): Server {
  const { app, rateLimitDispose } = createApp<TClaims>(configInput);

  const logger = configInput.observability?.logger ?? createNoopLogger();

  let httpServer: ReturnType<typeof serve> | undefined;
  let isShuttingDown = false;
  let readyResolve!: () => void;
  let readyReject!: (err: Error) => void;

  const ready = new Promise<void>((resolve, reject) => {
    readyResolve = resolve;
    readyReject = reject;
  });

  void ready.catch(() => {});

  const shutdown = async (signal: string): Promise<void> => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    logger.info(
      `[${configInput.spa.name ?? DEFAULTS.spa.name}] Received ${signal}, shutting down...`,
    );
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
    process.exit(0);
  };

  return {
    ready,
    start: (onReady?: (port: number) => void) => {
      if (httpServer) return;
      const port =
        Number.parseInt(process.env.PORT || '', 10) || (configInput.spa.port ?? DEFAULTS.spa.port);
      logger.info(`[${configInput.spa.name ?? DEFAULTS.spa.name}] Server starting on port ${port}`);
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
        logger.error(
          `[${configInput.spa.name ?? DEFAULTS.spa.name}] Failed to start: ${err.message}`,
        );
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
