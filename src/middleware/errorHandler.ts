import type { Context } from 'hono';
import type { Logger } from '../types/app';

/**
 * Create an error handler middleware that logs error details and returns a response.
 * Respects the error's `.status` property when present (e.g., HTTPError).
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
    const status = (() => {
      if (err instanceof globalThis.Error && 'status' in err) {
        return (err as unknown as { status: number }).status;
      }
      return 500;
    })() as Parameters<typeof c.json>[1];
    logger.error({} as TLogScope, `Internal server error: ${message}${suffix}`);
    return c.json({ error: 'Internal Server Error' }, status);
  };
}
