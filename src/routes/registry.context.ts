import type { Context, MiddlewareHandler, Next } from 'hono';
import { createScopedLogger } from '../config/defaults';
import { buildRequestContextFromHono } from '../services/proxy';
import type { HalideContext } from '../types/api';
import type { Logger, RequestContext } from '../types/app';

/**
 * Create a context middleware that builds `reqCtx` and `appCtx` from the Hono
 * context, creates a scoped logger when `logScopeFactory` is provided, and
 * stores both on the Hono context for downstream middleware.
 *
 * This middleware must run after auth (so `claims` are available) but before
 * the handler. It extracts JWT claims, builds a normalized request context,
 * and optionally bakes a per-request log scope into the logger.
 *
 * @typeParam TClaims - The type of the decoded JWT claims.
 * @typeParam TLogScope - The type of the structured log scope object.
 * @param logger - Base logger instance.
 * @param logScopeFactory - Optional per-request factory that produces a typed log scope.
 * @returns A Hono middleware handler.
 */
export function createContextMiddleware<TClaims = unknown, TLogScope = unknown>(
  logger: Logger<TLogScope>,
  logScopeFactory?: (ctx: RequestContext, claims: TClaims | undefined) => TLogScope,
): MiddlewareHandler {
  return async (c: Context, next: Next) => {
    const claims = c.get('claims') as TClaims | undefined;

    const body = c.get('parsedBody');
    const reqCtx = buildRequestContextFromHono(c, body) as RequestContext;

    let scopedLogger = logger;
    if (logScopeFactory) {
      const scope = logScopeFactory(reqCtx, claims);
      scopedLogger = createScopedLogger(logger, scope);
    }

    const appCtx: HalideContext<TClaims, TLogScope> = { claims, logger: scopedLogger };

    c.set('appCtx', appCtx);
    c.set('reqCtx', reqCtx);
    return next();
  };
}
