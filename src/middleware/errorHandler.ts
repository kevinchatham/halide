import type { Context } from 'hono';
import type { Logger } from '../config/types';

export function createErrorHandler(logger: Logger): (err: unknown, c: Context) => Response {
  return (err: unknown, c: Context) => {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error(`[error] ${c.req.method} ${c.req.path}:`, error);
    return c.json({ error: 'Internal Server Error' }, 500);
  };
}
