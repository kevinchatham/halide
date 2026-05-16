import type { Context } from 'hono';
import { DEFAULTS } from '../config/defaults';
import { extractBearerClaims, extractJwksClaims } from '../middleware/auth';
import type { Logger } from '../types/app';
import type { ClaimExtractor } from '../types/security';
import type { ServerConfig } from '../types/server-config';
import { createSecretCache } from '../utils/secretCache';

/** Wrap a string secret as a fetcher function that returns the secret synchronously. */
function stringSecretFetcher(s: string): () => string | Promise<string> {
  return () => s;
}

/** Create a JSON error response for authentication/authorization failures. */
export function createAuthErrorResponse(c: Context, status: number, message: string): Response {
  return c.json({ error: message }, { status: status as 400 | 401 | 403 | 404 | 500 } as const);
}

/**
 * Create a claim extractor from config, returning undefined when no auth is
 * configured.
 *
 * Selects between JWKS or bearer extraction based on the auth strategy.
 *
 * @typeParam TClaims - The type of the decoded JWT claims.
 * @typeParam TLogScope - The type of the structured log scope object.
 * @param config - The server configuration containing auth settings.
 * @param logger - Logger instance for error reporting.
 * @returns A claim extractor function or undefined when auth is disabled.
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
      typeof secret === 'string' ? stringSecretFetcher(secret) : secret;
    return async (c: Context): Promise<TClaims | null> => {
      const resolvedSecret = await cachedResolver(secretFetcher);
      return extractBearerClaims<TClaims>(c, resolvedSecret, audience, algorithms);
    };
  }

  return undefined;
}

/**
 * Extract JWT claims from request using the claim extractor, returning null
 * response on failure.
 *
 * Skips extraction for public routes or when no auth is configured.
 *
 * @typeParam TClaims - The type of the decoded JWT claims.
 * @param c - The Hono context.
 * @param route - The route, which determines access level.
 * @param claimExtractor - The configured claim extractor function.
 * @returns The extracted claims and a response to return on authentication failure.
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
