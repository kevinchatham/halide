import cors from 'cors';
import express, { Router } from 'express';
import './types/express';
import { BffConfigSchema, ServerConfigSchema } from './config/schema';
import type { BffConfig, ServerConfig } from './config/types';
import { createErrorHandler } from './middleware/errorHandler';
import { createLoggerMiddleware } from './middleware/logger';
import { createSecurityMiddleware } from './middleware/security';
import { registerApiRoutes, registerProxyRoutes } from './routes/registry';
import { createSpaHandler } from './routes/spa';

export interface Server<TClaims = unknown> {
  start: () => Promise<void>;
}

export function createBffMiddleware<TClaims = unknown>(configInput: BffConfig): Router {
  const config = BffConfigSchema.parse(configInput);
  const router = Router();

  const security = config.security ?? { cors: 'internal', csp: 'strict' };

  if (security.cors === 'internal') {
    router.use(cors({ origin: 'http://localhost:4200' }));
  } else {
    router.use(cors());
  }

  router.use(express.json());
  router.use(createLoggerMiddleware(config.app.name));
  router.use(createSecurityMiddleware(security.csp));
  router.use(createErrorHandler());

  registerProxyRoutes<TClaims>(router, config);
  registerApiRoutes<TClaims>(router, config);

  return router;
}

export function createServer<TClaims = unknown>(configInput: ServerConfig): Server<TClaims> {
  const config = ServerConfigSchema.parse(configInput);
  const app = express();

  app.use(createBffMiddleware<TClaims>(configInput));

  if (config.app?.spa?.root) {
    const spaHandler = createSpaHandler(config.app.spa);
    app.get(/^\/(.*)/, spaHandler);
  }

  return {
    start: async () => {
      const port = Number.parseInt(process.env['PORT'] || '3001', 10);
      await new Promise<void>((resolve) => {
        app.listen(port, () => {
          console.log(`[${config.app.name}] Server running on port ${port}`);
          resolve();
        });
      });
    },
  };
}
