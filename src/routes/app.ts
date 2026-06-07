import fs from 'node:fs/promises';
import path from 'node:path';
import { serveStatic } from '@hono/node-server/serve-static';
import type { Context, MiddlewareHandler } from 'hono';
import { DEFAULTS } from '../config/defaults';
import { createSecurityMiddleware } from '../middleware/security';
import type { AppConfig } from '../types/app';
import type { CspDirectives } from '../types/csp';

/**
 * Create app static file serving and fallback handlers.
 * @param appConfig - The app configuration (must have root defined).
 * @param csp - CSP directives to apply to the SPA fallback path.
 * @returns Object containing CSP middleware, static middleware, and app fallback handler.
 */
export function createAppHandler(
  appConfig: AppConfig & { root: string },
  csp?: CspDirectives,
): {
  cspMiddleware: MiddlewareHandler;
  staticMiddleware: MiddlewareHandler;
  appFallback: (c: Context) => Promise<Response>;
} {
  const { apiPrefix = DEFAULTS.app.apiPrefix, root, fallback = DEFAULTS.app.fallback } = appConfig;

  const resolvedRoot = path.resolve(root);

  const cspMiddleware = createSecurityMiddleware(csp ?? {});
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

  return { appFallback, cspMiddleware, staticMiddleware };
}
