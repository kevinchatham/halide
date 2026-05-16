import type { Context } from 'hono';
import type { Logger, RequestContext } from '../types/app';

/**
 * Create an error handler middleware that logs error details and returns a response.
 * Respects the error's `.status` property when present (e.g., HTTPError).
 *
 * When `logScopeFactory` is provided, the factory is called to produce a
 * per-request scope that is merged with the error metadata (e.g., errorStack)
 * before logging, so error logs automatically include the request context.
 *
 * @typeParam TLogScope - The type of the structured log scope object.
 * @typeParam TApp - The type of the app context passed to the factory.
 * @param logger - Logger instance for error logging.
 * @param logScopeFactory - Optional per-request factory that produces a typed log scope.
 * @returns A Hono error handler function.
 */
export function createErrorHandler<TLogScope = unknown, TApp = unknown>(
  logger: Logger<TLogScope>,
  logScopeFactory?: (ctx: RequestContext, app: TApp) => TLogScope,
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

    let logScope: TLogScope;
    if (logScopeFactory) {
      const reqCtx = c.get('reqCtx') as RequestContext | undefined;
      const appCtx = c.get('appCtx') as { claims: unknown; logger: Logger<TLogScope> } | undefined;
      const factoryScope =
        reqCtx && appCtx ? logScopeFactory(reqCtx, appCtx as unknown as TApp) : ({} as TLogScope);
      logScope = {
        ...(typeof factoryScope === 'object' && factoryScope !== null ? factoryScope : {}),
        ...(stack ? { errorStack: stack } : {}),
      } as TLogScope;
    } else {
      logScope = {
        ...(stack ? { errorStack: stack } : {}),
      } as TLogScope;
    }

    logger.error(logScope, `Internal server error: ${message}`);
    return c.json({ error: 'Internal Server Error' }, status);
  };
}
