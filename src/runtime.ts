import cors from 'cors';
import express from 'express';
import './types/express';
import { ServerConfigSchema } from './config/schema';
import type { ServerConfig } from './config/types';
import { createErrorHandler } from './middleware/errorHandler';
import { createLoggerMiddleware } from './middleware/logger';
import { createSecurityMiddleware } from './middleware/security';
import { registerApiRoutes, registerProxyRoutes } from './routes/registry';
import { createSpaHandler } from './routes/spa';

export interface Server<TClaims = unknown> {
  start: () => Promise<void>;
  stop: () => Promise<void>;
}

export function createServer<TClaims = unknown>(configInput: ServerConfig): Server<TClaims> {
  const config = ServerConfigSchema.parse(configInput);
  const app = express();

  const security = config.security ?? {
    cors: 'internal',
    corsOrigins: ['http://localhost:4200'],
    csp: 'strict',
  };

  if (security.cors === 'internal') {
    const origins = security.corsOrigins ?? ['http://localhost:4200'];
    app.use(cors({ origin: origins }));
  } else {
    app.use(cors());
  }

  app.use(express.json());
  app.use(createLoggerMiddleware(config.app.name));
  app.use(createSecurityMiddleware(security.csp));
  app.use(createErrorHandler());

  registerProxyRoutes<TClaims>(app, config);
  registerApiRoutes<TClaims>(app, config);

  const spaHandler = createSpaHandler(config.app.spa);
  app.get(/^\/(.*)/, spaHandler);

  let httpServer: ReturnType<typeof app.listen> | undefined;

  return {
    start: async () => {
      const port = Number.parseInt(process.env['PORT'] || '3001', 10);
      await new Promise<void>((resolve) => {
        httpServer = app.listen(port, () => {
          console.log(`[${config.app.name}] Server running on port ${port}`);
          resolve();
        });
      });
    },
    stop: async () => {
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
