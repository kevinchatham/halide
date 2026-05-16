import type { Context, MiddlewareHandler, Next } from 'hono';
import { asInternalLogger, DEFAULTS } from '../config/defaults';
import { extractBearerClaims, extractJwksClaims } from '../middleware/auth';
import { buildRequestContextFromHono } from '../services/proxy';
import type { AuthorizeFn, HalideContext } from '../types/api';
import type { Logger, RequestContext } from '../types/app';
import type { ClaimExtractor } from '../types/security';
import type { ServerConfig } from '../types/server-config';
import { createSecretCache } from '../utils/secretCache';

/** Wrap a string secret in a fetcher function for compatibility with the cached secret resolver. */
function _stringSecretFetcher(s: string): () => string | Promise<string> {
  return () => s;
}

/**
 * Create an auth error response with the given HTTP status and error message.
 *
 * Returns a JSON response with the error message and the specified HTTP status code.
 * Only accepts 400, 401, 403, 404, or 500 as valid status codes.
 *
 * @param c - The Hono context.
 * @param status - HTTP status code (400, 401, 403, 404, or 500).
 * @param message - Error message to include in the response body.
 * @returns A JSON response with the error.
 */
export function createAuthErrorResponse(c: Context, status: number, message: string): Response {
  return c.json({ error: message }, { status: status as 400 | 401 | 403 | 404 | 500 } as const);
}

/**
 * Create a JWT claim extractor function based on the configured auth strategy.
 *
 * When `security.auth.strategy` is `'jwks'`, returns an extractor that uses
 * {@link extractJwksClaims}. When it's `'bearer'` (or unspecified), returns
 * one that uses {@link extractBearerClaims} with the configured secret and TTL caching.
 * Returns `undefined` when no auth is configured.
 *
 * @typeParam TClaims - The type of the decoded JWT claims.
 * @typeParam TLogScope - The type of the structured log scope object.
 * @param config - The server configuration containing auth settings.
 * @param logger - Logger instance for error reporting.
 * @returns A claim extractor function, or `undefined` when auth is not configured.
 */
export function createClaimExtractor<TClaims = unknown, TLogScope = unknown>(
  config: ServerConfig<TClaims, TLogScope>,
  logger: Logger<TLogScope>,
): ClaimExtractor<TClaims> | undefined {
  const auth = config.security?.auth;
  if (!auth) return undefined;

  if (auth.strategy === 'jwks' && auth.jwksUri) {
    const { jwksUri, audience, algorithms } = auth;
    return (c: Context): Promise<TClaims | null> =>
      extractJwksClaims<TClaims>(c, jwksUri, audience, algorithms);
  }

  if (auth.secret) {
    const { secret, audience, secretTtl, algorithms } = auth;
    const ttl = secretTtl ?? DEFAULTS.auth.secretTtl;
    const cachedResolver = createSecretCache(ttl, logger);
    const secretFetcher: () => string | Promise<string> =
      typeof secret === 'string' ? _stringSecretFetcher(secret) : secret;
    return async (c: Context): Promise<TClaims | null> => {
      const resolvedSecret = await cachedResolver(secretFetcher);
      return extractBearerClaims<TClaims>(c, resolvedSecret, audience, algorithms);
    };
  }

  return undefined;
}

/**
 * Extract JWT claims from the request using the configured claim extractor.
 *
 * For public routes or when no auth is configured, returns `{ claims: undefined, response: null }`.
 * For private routes, calls the claim extractor and returns a 401 response when extraction fails.
 *
 * @typeParam TClaims - The type of the decoded JWT claims.
 * @param c - The Hono context.
 * @param route - The route access level (`'public'` or `'private'`).
 * @param claimExtractor - JWT claim extractor function.
 * @returns Claims and an optional auth error response.
 */
export async function extractClaims<TClaims = unknown>(
  c: Context,
  route: { access: string },
  claimExtractor: ClaimExtractor<TClaims> | undefined,
): Promise<{ claims: TClaims | undefined; response: Response | null }> {
  if (route.access === 'public' || !claimExtractor) {
    return { claims: undefined, response: null };
  }
  const extracted = await claimExtractor(c);
  if (extracted === null) {
    return {
      claims: undefined,
      response: createAuthErrorResponse(c, 401, 'Unauthorized'),
    };
  }
  return { claims: extracted, response: null };
}

/**
 * Check authorization by calling the route's `authorize` function.
 *
 * Returns a 403 Forbidden response when `route.authorize` is defined and
 * returns false (or throws). Returns `null` when no authorize function is
 * configured or when authorization succeeds.
 *
 * @typeParam TClaims - The type of the decoded JWT claims.
 * @typeParam TLogScope - The type of the structured log scope object.
 * @param c - The Hono context.
 * @param route - The route with an optional authorize function.
 * @param app - Bundled app context with claims and logger.
 * @param body - The parsed request body.
 * @param logger - Logger instance for error reporting.
 * @returns A 403 response on failure, or `null` on success/no authorize function.
 */
export async function checkAuthorization<TClaims = unknown, TLogScope = unknown>(
  c: Context,
  route: { authorize?: AuthorizeFn<TClaims, TLogScope> },
  app: HalideContext<TClaims, TLogScope>,
  body: unknown,
  logger: Logger<TLogScope>,
): Promise<Response | null> {
  if (!route.authorize) return null;
  try {
    const ctx = buildRequestContextFromHono(c, body) as RequestContext;
    const allowed = await route.authorize(ctx, app);
    if (!allowed) {
      return createAuthErrorResponse(c, 403, 'Forbidden');
    }
    return null;
  } catch (err) {
    asInternalLogger(logger).error(
      {},
      `authorize function threw: ${err instanceof Error ? err.message : String(err)}`,
    );
    return createAuthErrorResponse(c, 403, 'Forbidden');
  }
}

/**
 * Create an auth middleware that extracts JWT claims and checks authorization.
 *
 * For public routes, skips auth entirely. For private routes, extracts claims
 * via the claim extractor (401 on failure) and checks the route's authorize
 * function (403 on failure). Stores claims on the Hono context and chains to next.
 *
 * @typeParam TClaims - The type of the decoded JWT claims.
 * @typeParam TLogScope - The type of the structured log scope object.
 * @param route - The route with access level and optional authorize function.
 * @param claimExtractor - JWT claim extractor function.
 * @param logger - Logger instance for error reporting.
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

    const forbidResponse = await checkAuthorization(c, route, appCtx, body, logger);
    if (forbidResponse) return forbidResponse;

    c.set('claims', claims);
    return next();
  };
}
