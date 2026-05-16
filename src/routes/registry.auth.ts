import type { Context, MiddlewareHandler, Next } from 'hono';
import { createScopedLogger } from '../config/defaults';
import { buildRequestContextFromHono } from '../services/proxy';
import type { AuthorizeFn, HalideContext } from '../types/api';
import type { Logger, RequestContext } from '../types/app';
import type { ClaimExtractor } from '../types/security';
import { checkAuthorization } from './registry.authorization';
import { extractClaims } from './registry.claims';

/**
 * Create an auth middleware that extracts claims, builds context objects,
 * and checks authorization.
 *
 * When `logScopeFactory` is provided, creates a per-request scoped logger
 * that automatically applies the factory's scope to every log call within
 * the request, so handlers and hooks don't need to pass scope manually.
 *
 * Stores c.set('appCtx', { claims, logger }) and c.set('reqCtx', requestCtx)
 * for downstream middleware. Returns 401 on auth failure, 403 on authorization
 * denial.
 *
 * @typeParam TClaims - The type of the decoded JWT claims.
 * @typeParam TLogScope - The type of the structured log scope object.
 * @param route - The route definition (provides access level and authorize function).
 * @param claimExtractor - The configured claim extractor function.
 * @param logger - Base logger instance for error reporting.
 * @param logScopeFactory - Optional per-request factory that produces a typed log scope.
 * @returns A Hono middleware handler.
 */
export function createAuthMiddleware<TClaims = unknown, TLogScope = unknown>(
  route: { access: string; authorize?: AuthorizeFn<TClaims, TLogScope> },
  claimExtractor: ClaimExtractor<TClaims> | undefined,
  logger: Logger<TLogScope>,
  logScopeFactory?: (ctx: RequestContext, claims: TClaims | undefined) => TLogScope,
): MiddlewareHandler {
  return async (c: Context, next: Next) => {
    const { claims, response: authResponse } = await extractClaims(c, route, claimExtractor);
    if (authResponse) return authResponse;

    const body = c.get('parsedBody');
    const reqCtx = buildRequestContextFromHono(c, body) as RequestContext;

    let scopedLogger = logger;
    if (logScopeFactory) {
      const scope = logScopeFactory(reqCtx, claims);
      scopedLogger = createScopedLogger(logger, scope);
    }

    const appCtx: HalideContext<TClaims, TLogScope> = { claims, logger: scopedLogger };

    const forbidResponse = await checkAuthorization(c, route, appCtx, body, reqCtx);
    if (forbidResponse) return forbidResponse;

    c.set('appCtx', appCtx);
    c.set('reqCtx', reqCtx);
    return next();
  };
}
