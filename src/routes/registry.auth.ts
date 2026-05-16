import type { Context, MiddlewareHandler, Next } from 'hono';
import type { AuthorizeFn, HalideContext } from '../types/api';
import type { Logger } from '../types/app';
import type { ClaimExtractor } from '../types/security';
import { checkAuthorization } from './registry.authorization';
import { extractClaims } from './registry.claims';

/**
 * Create an auth middleware that extracts claims and checks authorization.
 *
 * Stores c.set('claims', claims) for downstream middleware.
 * Returns 401 on auth failure, 403 on authorization denial.
 *
 * @typeParam TClaims - The type of the decoded JWT claims.
 * @typeParam TLogScope - The type of the structured log scope object.
 * @param route - The route definition (provides access level and authorize function).
 * @param claimExtractor - The configured claim extractor function.
 * @param logger - Base logger instance for error reporting.
 * @returns A Hono middleware handler.
 */
export function createAuthMiddleware<TClaims = unknown, TLogScope = unknown>(
  route: { access: string; authorize?: AuthorizeFn<TClaims, TLogScope> },
  claimExtractor: ClaimExtractor<TClaims> | undefined,
  logger: Logger<TLogScope>,
): MiddlewareHandler {
  return async (c: Context, next: Next) => {
    const { claims, response: authResponse } = await extractClaims(c, route, claimExtractor);
    if (authResponse) return authResponse;

    const body = c.get('parsedBody');
    const appCtx: HalideContext<TClaims, TLogScope> = { claims, logger };

    const forbidResponse = await checkAuthorization(c, route, appCtx, body);
    if (forbidResponse) return forbidResponse;

    c.set('claims', claims);
    return next();
  };
}
