import type { Context, Next } from 'hono';

/**
 * Create middleware that adds a unique request ID to each request.
 * Uses the x-request-id header if present, otherwise generates a new UUID.
 * @returns A Hono middleware handler.
 */
export function createRequestIdMiddleware() {
  return async (c: Context, next: Next): Promise<void> => {
    const requestId = c.req.header('x-request-id') ?? crypto.randomUUID();
    c.header('x-request-id', requestId);
    await next();
  };
}
