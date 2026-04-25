import type { Context } from 'hono';
import type { Logger } from '../types';

/**
 * Create an error handler middleware that logs errors and returns a 500 response.
 * @param logger - Logger instance for recording errors.
 * @returns A Hono error handler function.
 */
export function createErrorHandler(logger: Logger): (err: unknown, c: Context) => Response {
  return (err: unknown, c: Context) => {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error(`[error] ${c.req.method} ${c.req.path}:`, error);
    return c.json({ error: 'Internal Server Error' }, 500);
  };
}
