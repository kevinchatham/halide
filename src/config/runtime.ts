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
  start: () => Promise<void>;
  stop: () => Promise<void>;
}

export interface CreateAppResult {
  app: Hono<{ Variables: HalideVariables }>;
  rateLimitDispose: (() => void) | undefined;
}

export async function createApp<TClaims = unknown>(
  configInput: ServerConfig<TClaims>,
): Promise<CreateAppResult> {
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

  app.use('*', createSecurityMiddleware(security?.csp ?? {}));

  if (configInput.observability?.requestId) {
    app.use('*', createRequestIdMiddleware());
  }

  await registerRoutes<TClaims>(app, configInput, logger);

  createOpenApiRoutes(configInput, app as unknown as Hono);

  const { staticMiddleware, spaFallback } = createSpaHandler(configInput.spa);
  app.get('/*', staticMiddleware);
  app.all('/*', spaFallback);

  app.onError(createErrorHandler(logger));

  return { app, rateLimitDispose };
}

export async function createServer<TClaims = unknown>(
  configInput: ServerConfig<TClaims>,
): Promise<Server> {
  const { app, rateLimitDispose } = await createApp<TClaims>(configInput);

  const logger = configInput.observability?.logger ?? createNoopLogger();

  let httpServer: ReturnType<typeof serve> | undefined;

  return {
    start: async () => {
      const port =
        Number.parseInt(process.env.PORT || '', 10) || (configInput.spa.port ?? DEFAULTS.spa.port);
      await new Promise<void>((resolve) => {
        httpServer = serve(
          {
            fetch: app.fetch,
            port,
          },
          () => {
            logger.info(
              `[${configInput.spa.name ?? DEFAULTS.spa.name}] Server running on port ${port}`,
            );
            resolve();
          },
        );
      });
    },
    stop: async () => {
      rateLimitDispose?.();
      const server = httpServer;
      if (!server) {
        return;
      }
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
