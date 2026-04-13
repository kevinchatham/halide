import cors from 'cors';
import express from 'express';
import './types/express';
import { ServerConfigSchema } from './config/schema';
import type { ServerConfig } from './config/types';
import { createErrorHandler } from './middleware/errorHandler';
import { createLoggerMiddleware } from './middleware/logger';
import { createSecurityMiddleware } from './middleware/security';
import { registerRoutes } from './routes/registry';

export interface Server<TClaims = unknown> {
  start: () => Promise<void>;
}

export function createServer<TClaims = unknown>(configInput: ServerConfig): Server<TClaims> {
  const config: ServerConfig = ServerConfigSchema.parse(configInput);
  const app = express();

  const security = config.security ?? { cors: 'internal', csp: 'strict' };

  if (security.cors === 'internal') {
    app.use(cors({ origin: 'http://localhost:4200' }));
  } else {
    app.use(cors());
  }

  app.use(express.json());
  app.use(createLoggerMiddleware(config.app.name));
  app.use(createSecurityMiddleware(security.csp));

  app.use(createErrorHandler());

  registerRoutes<TClaims>(app, config);

  return {
    start: async () => {
      const port = Number.parseInt(process.env['PORT'] || '3000', 10);
      await new Promise<void>((resolve) => {
        app.listen(port, () => {
          console.log(`[${config.app.name}] Server running on port ${port}`);
          resolve();
        });
      });
    },
  };
}
