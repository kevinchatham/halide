import cors from 'cors';
import express from 'express';
import './types/express';
import { createNoopLogger, DEFAULTS } from './config/defaults';
import type { ServerConfig } from './config/types';
import { validateServerConfig } from './config/validate';
import { createErrorHandler } from './middleware/errorHandler';
import { createRateLimitMiddleware } from './middleware/rateLimit';
import { createRequestIdMiddleware } from './middleware/requestId';
import { createSecurityMiddleware } from './middleware/security';
import { createSwaggerMiddleware } from './middleware/swagger';
import { registerRoutes } from './routes/registry';
import { createSpaHandler } from './routes/spa';

export interface Server {
  start: () => Promise<void>;
  stop: () => Promise<void>;
}

export async function createServer<TClaims = unknown>(
  configInput: ServerConfig<TClaims>,
): Promise<Server> {
  validateServerConfig(configInput);

  const logger = configInput.observability?.logger ?? createNoopLogger();
  const app = express();

  const security = configInput.security;
  const corsConfig = security?.cors;
  const cspConfig = security?.csp ?? {};
  const corsMethods = corsConfig?.methods ?? DEFAULTS.cors.methods;
  const corsOrigin = corsConfig?.origin ?? DEFAULTS.cors.origin;
  const corsCredentials = corsConfig?.credentials ?? DEFAULTS.cors.credentials;

  app.use(
    cors({
      allowedHeaders: corsConfig?.allowedHeaders,
      credentials: corsCredentials,
      exposedHeaders: corsConfig?.exposedHeaders,
      maxAge: corsConfig?.maxAge,
      methods: corsMethods.map((m) => m.toUpperCase()),
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
    app.use(middleware);
    rateLimitDispose = dispose;
  }

  app.use(express.json());
  app.use(createSecurityMiddleware(cspConfig));

  if (configInput.observability?.requestId) {
    app.use(createRequestIdMiddleware());
  }

  await registerRoutes<TClaims>(app, configInput, logger);

  if (configInput.openapi?.enabled) {
    const swaggerPath = configInput.openapi.path ?? DEFAULTS.openapi.path;
    const swaggerRouter = createSwaggerMiddleware(configInput, configInput.openapi.options);
    app.use(swaggerPath, swaggerRouter);
  }

  const spaMiddlewares = createSpaHandler(configInput.spa);
  for (const mw of spaMiddlewares) {
    app.use(mw);
  }

  app.use(createErrorHandler(logger));

  let httpServer: ReturnType<typeof app.listen> | undefined;

  return {
    start: async () => {
      const port = Number.parseInt(process.env['PORT'] || '3001', 10);
      await new Promise<void>((resolve) => {
        httpServer = app.listen(port, () => {
          logger.info(
            `[${configInput.spa.name ?? DEFAULTS.spa.name}] Server running on port ${port}`,
          );
          resolve();
        });
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
