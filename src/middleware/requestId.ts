import type { Context, Next } from 'hono';

export function createRequestIdMiddleware() {
  return async (c: Context, next: Next): Promise<void> => {
    const requestId = c.req.header('x-request-id') ?? generateRequestId();
    c.header('x-request-id', requestId);
    await next();
  };
}

function generateRequestId(): string {
  return crypto.randomUUID();
}
