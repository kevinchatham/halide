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
    const rawStatus =
      err instanceof globalThis.Error && 'status' in err
        ? (err as unknown as { status: number }).status
        : 500;
    const status = (rawStatus >= 400 && rawStatus < 600 ? rawStatus : 500) as Parameters<
      typeof c.json
    >[1];
    const logScope = {
      ...(stack ? { errorStack: stack } : {}),
    } as TLogScope;
    logger.error(logScope, `Internal server error: ${message}`);
    return c.json({ error: 'Internal Server Error' }, status);
  };
}
