import type { Context } from 'hono';
import type { Logger } from '../types/app';

/**
 * Create an error handler middleware that logs error details and returns a 500 response.
 * @param logger - Logger instance for error logging.
 * @returns A Hono error handler function.
 */
export function createErrorHandler<TLogScope = unknown>(
  logger: Logger<TLogScope>,
): (err: unknown, c: Context) => Response {
  return (err: unknown, c: Context) => {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error && err.stack ? err.stack : undefined;
    const suffix = stack ? `\n${stack}` : '';
    logger.error({} as TLogScope, `Internal server error: ${message}${suffix}`);
    return c.json({ error: 'Internal Server Error' }, 500);
  };
}
