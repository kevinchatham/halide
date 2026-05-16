import type { Context } from 'hono';
import { MAX_EXTRACTOR_CACHE } from '../config/constants';
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

/**
 * Cache for claim extractors keyed by auth strategy.
 * Evicts the oldest entry (FIFO) when the cache exceeds MAX_EXTRACTOR_CACHE.
 */
export class ClaimExtractorCache {
  private readonly cache = new Map<string, ClaimExtractor<unknown> | undefined>();

  get(key: string): ClaimExtractor<unknown> | undefined {
    return this.cache.get(key);
  }

  set(key: string, value: ClaimExtractor<unknown> | undefined): void {
    if (this.cache.size >= MAX_EXTRACTOR_CACHE) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }

  reset(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

/** Create a ClaimExtractorCache instance. */
export function createClaimExtractorCache(): ClaimExtractorCache {
  return new ClaimExtractorCache();
}

/** No-op claim extractor cache for use when no auth is configured. */
export const NOOP_EXTRACTOR_CACHE = new ClaimExtractorCache();

/** Create a JSON error response for authentication/authorization failures. */
export function createAuthErrorResponse(c: Context, status: number, message: string): Response {
  return c.json({ error: message }, { status: status as 400 | 401 | 403 | 404 | 500 } as const);
}

/**
 * Create a claim extractor from config, returning undefined when no auth is
 * configured.
 *
 * Selects between JWKS or bearer extraction based on the auth strategy.
 * Results are cached by auth strategy key for reuse across calls.
 *
 * @typeParam TClaims - The type of the decoded JWT claims.
 * @typeParam TLogScope - The type of the structured log scope object.
 * @param config - The server configuration containing auth settings.
 * @param logger - Logger instance for error reporting.
 * @param cache - The claim extractor cache instance.
 * @returns A claim extractor function or undefined when auth is disabled.
 */
export function createClaimExtractor<TClaims = unknown, TLogScope = unknown>(
  config: ServerConfig<TClaims, TLogScope>,
  logger: Logger<TLogScope>,
  cache: ClaimExtractorCache = NOOP_EXTRACTOR_CACHE,
): ClaimExtractor<TClaims> | undefined {
  const auth = config.security?.auth;
  if (!auth) return undefined;

  const key = auth.strategy || 'none';
  const cached = cache.get(key);
  if (cached) return cached as ClaimExtractor<TClaims> | undefined;

  let result: ClaimExtractor<unknown> | undefined;

  if (auth.strategy === 'jwks' && auth.jwksUri) {
    const { jwksUri, audience, algorithms } = auth;
    result = (c: Context): Promise<TClaims | null> =>
      extractJwksClaims<TClaims>(c, jwksUri, audience, algorithms);
  } else if (auth.secret) {
    const { secret, audience, secretTtl, algorithms } = auth;
    const ttl = secretTtl ?? DEFAULTS.auth.secretTtl;
    const cachedResolver = createSecretCache(ttl, logger);
    const secretFetcher: () => string | Promise<string> =
      typeof secret === 'string' ? stringSecretFetcher(secret) : secret;
    result = async (c: Context): Promise<TClaims | null> => {
      const resolvedSecret = await cachedResolver(secretFetcher);
      return extractBearerClaims<TClaims>(c, resolvedSecret, audience, algorithms);
    };
  }

  if (result) {
    cache.set(key, result);
  }
  return result as ClaimExtractor<TClaims> | undefined;
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
