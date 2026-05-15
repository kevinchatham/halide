import type { Context, MiddlewareHandler, Next } from 'hono';
import type { ApiRoute, ProxyRoute } from '../types/api';
import type { HalideContext } from '../types/app';
import { BodyParseError, parseJsonBody } from '../utils/parseJsonBody.js';

/** Hono method types that have a request body. */
type BodyMethod = 'post' | 'put' | 'patch';

/**
 * Create a body parsing middleware for API routes without a requestSchema.
 *
 * Handles POST/PUT/PATCH body parsing via parseJsonBody(). Stores result in
 * c.set('parsedBody', body). Returns 400 on JSON parse error.
 *
 * Skips body parsing for GET, HEAD, DELETE, and other methods without a body.
 * Also skips when `requestSchema` is set (hono-openapi validator already parses
 * the body before this middleware runs).
 *
 * Must call next() to continue the middleware chain when no body is returned.
 *
 * @param route - The API route definition.
 * @returns A Hono middleware handler.
 */
export function createApiBodyParser<TApp = HalideContext>(
  route: ApiRoute<TApp>,
): MiddlewareHandler {
  const methodsWithBody = new Set<BodyMethod | string>(['POST', 'PUT', 'PATCH']);

  return async (c: Context, next: Next) => {
    if (route.requestSchema) {
      const body = (c.req as { valid: (format: string) => unknown }).valid('json');
      c.set('parsedBody', body);
      return next();
    }

    const method = c.req.method.toUpperCase();
    if (!methodsWithBody.has(method)) return next();

    const raw = c.req.raw;
    if (!raw?.body) return next();

    try {
      const parsed = await parseJsonBody(c);
      c.set('parsedBody', parsed);
      return next();
    } catch (e) {
      if (e instanceof BodyParseError) return c.json({ error: e.message }, 400);
      throw e;
    }
  };
}

/**
 * Create a body parsing middleware for proxy routes with a transform function.
 *
 * Parses body and stores via c.set('parsedBody'). Returns 400 on JSON parse error.
 *
 * Skips body parsing when no transform function is configured.
 *
 * @param route - The proxy route definition.
 * @returns A Hono middleware handler.
 */
export function createProxyBodyParser<TApp = HalideContext>(
  route: ProxyRoute<TApp>,
): MiddlewareHandler {
  return async (c: Context, next: Next) => {
    if (!route.transform) return next();

    try {
      const parsed = await parseJsonBody(c);
      c.set('parsedBody', parsed);
      return next();
    } catch (e) {
      if (e instanceof BodyParseError) return c.json({ error: e.message }, 400);
      throw e;
    }
  };
}
