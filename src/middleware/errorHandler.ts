import type { Context } from 'hono';
import type { Logger } from '../types/app';

/**
 * Create an error handler middleware that returns a 500 response.
 * @param _logger - Logger instance (unused, kept for API compatibility).
 * @returns A Hono error handler function.
 */
export function createErrorHandler<TLogScope = unknown>(
  _logger: Logger<TLogScope>,
): (err: unknown, c: Context) => Response {
  return (_err: unknown, c: Context) => {
    return c.json({ error: 'Internal Server Error' }, 500);
  };
}
