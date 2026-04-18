import cors from 'cors';
import express from 'express';
import './types/express';
import { DEFAULTS } from './config/defaults';
import type { ServerConfig } from './config/types';
import { validateServerConfig } from './config/validate';
import { createErrorHandler } from './middleware/errorHandler';
import { createRateLimitMiddleware } from './middleware/rateLimit';
import { createSecurityMiddleware } from './middleware/security';
import { createSwaggerMiddleware } from './middleware/swagger';
import { registerRoutes } from './routes/registry';
import { createSpaHandler } from './routes/spa';

export interface Server {
  start: () => Promise<void>;
  stop: () => Promise<void>;
}

export async function createServer<TClaims = unknown>(
  configInput: ServerConfig<TClaims>
): Promise<Server> {
  validateServerConfig(configInput);

  const app = express();

  const security = configInput.security;
  const corsConfig = security?.cors;
  const cspConfig = security?.csp ?? {};
  const corsMethods = corsConfig?.methods ?? DEFAULTS.cors.methods;
  const corsOrigin = corsConfig?.origin ?? DEFAULTS.cors.origin;
  const corsCredentials = corsConfig?.credentials ?? DEFAULTS.cors.credentials;

  app.use(
    cors({
      origin: corsOrigin,
      methods: corsMethods.map((m) => m.toUpperCase()),
      allowedHeaders: corsConfig?.allowedHeaders,
      exposedHeaders: corsConfig?.exposedHeaders,
      credentials: corsCredentials,
      maxAge: corsConfig?.maxAge,
    })
  );

  let rateLimitDispose: (() => void) | undefined;

  if (security?.rateLimit) {
    const rateLimitConfig = security.rateLimit;
    const { middleware, dispose } = createRateLimitMiddleware({
      windowMs: rateLimitConfig.windowMs ?? DEFAULTS.rateLimit.windowMs,
      maxRequests: rateLimitConfig.maxRequests ?? DEFAULTS.rateLimit.maxRequests,
    });
    app.use(middleware);
    rateLimitDispose = dispose;
  }

  app.use(express.json());
  app.use(createSecurityMiddleware(cspConfig));

  await registerRoutes<TClaims>(app, configInput);

  if (configInput.openapi?.enabled) {
    const swaggerPath = configInput.openapi.path ?? DEFAULTS.openapi.path;
    const swaggerRouter = createSwaggerMiddleware(configInput, configInput.openapi.options);
    app.use(swaggerPath, swaggerRouter);
  }

  const spaHandler = createSpaHandler(configInput.spa);
  app.get(/^\/(.*)/, spaHandler);

  app.use(createErrorHandler());

  let httpServer: ReturnType<typeof app.listen> | undefined;

  return {
    start: async () => {
      const port = Number.parseInt(process.env['PORT'] || '3001', 10);
      await new Promise<void>((resolve) => {
        httpServer = app.listen(port, () => {
          console.log(
            `[${configInput.spa.name ?? DEFAULTS.spa.name}] Server running on port ${port}`
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
