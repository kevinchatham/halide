import fs from 'node:fs/promises';
import path from 'node:path';
import { serveStatic } from '@hono/node-server/serve-static';
import type { Context, MiddlewareHandler } from 'hono';
import { DEFAULTS } from '../config/defaults';
import type { AppConfig } from '../types';

/**
 * Create app static file serving and fallback handlers.
 * @param appConfig - The app configuration (must have root defined).
 * @returns Object containing static middleware and app fallback handler.
 */
export function createAppHandler(appConfig: AppConfig & { root: string }): {
  staticMiddleware: MiddlewareHandler;
  appFallback: (c: Context) => Promise<Response>;
} {
  const { apiPrefix = DEFAULTS.app.apiPrefix, root, fallback = DEFAULTS.app.fallback } = appConfig;

  const resolvedRoot = path.resolve(root);

  const staticMiddleware = serveStatic({ root: resolvedRoot });

  const appFallback = async (c: Context): Promise<Response> => {
    if (apiPrefix && c.req.path.startsWith(apiPrefix)) {
      return c.json({ error: 'Not Found' }, 404);
    }
    try {
      const content = await fs.readFile(path.join(resolvedRoot, fallback), 'utf-8');
      return c.html(content);
    } catch {
      return c.notFound();
    }
  };

  return { appFallback, staticMiddleware };
}
