import type { Context } from 'hono';
import type { ApiRoute } from '../types/api';

/**
 * Resolve request body, using request schema if available, otherwise parsing
 * JSON for POST/PUT/PATCH methods.
 *
 * @typeParam TApp - The bundled app context type combining claims and logger.
 * @param c - The Hono context.
 * @param route - The API route, which may have a request schema.
 * @returns The parsed request body or undefined.
 */
export function resolveBody<TApp>(c: Context, route: ApiRoute<TApp>): unknown {
  if (route.requestSchema) return (c.req as { valid: (format: string) => unknown }).valid('json');
  const methodsWithBody = new Set(['POST', 'PUT', 'PATCH']);
  return methodsWithBody.has(c.req.method.toUpperCase())
    ? c.req.json().catch(() => undefined)
    : undefined;
}
