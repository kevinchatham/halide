import cors from 'cors';
import express from 'express';
import './types/express';
import type { RequestContext } from './config/schema';
import { CorsConfigSchema, ObservabilityConfigSchema, ServerConfigSchema } from './config/schema';
import type { ServerConfig } from './config/types';
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
  const { routes, ...configRest } = configInput;
  const config = ServerConfigSchema.parse(configRest);
  const app = express();

  const corsConfig = config.security?.cors ?? CorsConfigSchema.parse({});
  const cspConfig = config.security?.csp ?? {};

  app.use(
    cors({
      origin: corsConfig.origin,
      methods: corsConfig.methods.map((m) => m.toUpperCase()),
      allowedHeaders: corsConfig.allowedHeaders,
      exposedHeaders: corsConfig.exposedHeaders,
      credentials: corsConfig.credentials,
      maxAge: corsConfig.maxAge,
    })
  );

  if (config.security?.rateLimit) {
    app.use(createRateLimitMiddleware(config.security.rateLimit));
  }

  app.use(express.json());
  app.use(createSecurityMiddleware(cspConfig));
  app.use(createErrorHandler());

  const observability = ObservabilityConfigSchema.parse(config.observability ?? {});
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

  await registerRoutes<TClaims>(app, { ...config, routes });

  const spaHandler = createSpaHandler(config.spa);
  app.get(/^\/(.*)/, spaHandler);

  let httpServer: ReturnType<typeof app.listen> | undefined;

  return {
    start: async () => {
      const port = Number.parseInt(process.env['PORT'] || '3001', 10);
      await new Promise<void>((resolve) => {
        httpServer = app.listen(port, () => {
          console.log(`[${config.spa.name}] Server running on port ${port}`);
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
