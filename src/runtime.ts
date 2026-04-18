import cors from 'cors';
import express from 'express';
import './types/express';
import type { RequestContext, ServerConfig } from './config/types';
import { validateServerConfig } from './config/validate';
import { createErrorHandler } from './middleware/errorHandler';
import { createRateLimitMiddleware } from './middleware/rateLimit';
import { createSecurityMiddleware } from './middleware/security';
import { registerRoutes } from './routes/registry';
import { createSpaHandler } from './routes/spa';

export interface Server<TClaims = unknown> {
  start: () => Promise<void>;
  stop: () => Promise<void>;
}

export async function createServer<TClaims = unknown>(
  configInput: ServerConfig<TClaims>
): Promise<Server<TClaims>> {
  validateServerConfig(configInput);

  const app = express();

  const security = configInput.security;
  const corsConfig = security?.cors;
  const cspConfig = security?.csp ?? {};
  const corsMethods = corsConfig?.methods ?? ['get', 'post', 'put', 'delete', 'patch'];
  const corsOrigin = corsConfig?.origin ?? ['*'];
  const corsCredentials = corsConfig?.credentials ?? false;

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

  if (security?.rateLimit) {
    const rateLimitConfig = security.rateLimit;
    app.use(
      createRateLimitMiddleware({
        windowMs: rateLimitConfig.windowMs ?? 900000,
        maxRequests: rateLimitConfig.maxRequests ?? 100,
      })
    );
  }

  app.use(express.json());
  app.use(createSecurityMiddleware(cspConfig));
  app.use(createErrorHandler());

  const observability = configInput.observability ?? {};
  if (observability.onRequest || observability.onResponse) {
    app.use((req, res, next) => {
      const start = Date.now();

      const ctx: RequestContext = {
        method: req.method.toLowerCase() as RequestContext['method'],
        path: req.path,
        headers: req.headers as Record<string, string | string[]>,
        params: Object.fromEntries(Object.entries(req.params).map(([k, v]) => [k, String(v)])),
        query: Object.fromEntries(
          Object.entries(req.query).map(([k, v]) => [
            k,
            Array.isArray(v) ? v.map(String) : String(v),
          ])
        ),
        body: req.body,
      };

      observability.onRequest?.(ctx, undefined);

      if (observability.onResponse) {
        res.on('finish', async () => {
          observability.onResponse?.(ctx, undefined, {
            statusCode: res.statusCode,
            durationMs: Date.now() - start,
            error: res.locals?.error,
          });
        });
      }

      next();
    });
  }

  await registerRoutes<TClaims>(app, configInput);

  const spaHandler = createSpaHandler(configInput.spa);
  app.get(/^\/(.*)/, spaHandler);

  let httpServer: ReturnType<typeof app.listen> | undefined;

  return {
    start: async () => {
      const port = Number.parseInt(process.env['PORT'] || '3001', 10);
      await new Promise<void>((resolve) => {
        httpServer = app.listen(port, () => {
          console.log(`[${configInput.spa.name ?? 'app'}] Server running on port ${port}`);
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
