import fs from 'node:fs/promises';
import path from 'node:path';
import { serveStatic } from '@hono/node-server/serve-static';
import type { Context, MiddlewareHandler } from 'hono';
import { DEFAULTS } from '../config/defaults';
import type { SpaConfig } from '../types';

export function createSpaHandler(spaConfig: NonNullable<SpaConfig>): {
  staticMiddleware: MiddlewareHandler;
  spaFallback: (c: Context) => Promise<Response>;
} {
  const { apiPrefix = DEFAULTS.spa.apiPrefix, root, fallback = DEFAULTS.spa.fallback } = spaConfig;

  const staticMiddleware = serveStatic({ root });

  const spaFallback = async (c: Context): Promise<Response> => {
    if (apiPrefix && c.req.path.startsWith(apiPrefix)) {
      return c.json({ error: 'Not Found' }, 404);
    }
    try {
      const content = await fs.readFile(path.join(root, fallback), 'utf-8');
      return c.html(content);
    } catch {
      return c.notFound();
    }
  };

  return { spaFallback, staticMiddleware };
}
