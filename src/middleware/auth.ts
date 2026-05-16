import type { Context } from 'hono';
import { verify } from 'hono/jwt';
import { JWKS_CACHE_TTL_MS, MAX_JWK_CACHE, MAX_JWK_LOCKS } from '../config/constants';

type AsymmetricAlgorithm =
  | 'RS256'
  | 'RS384'
  | 'RS512'
  | 'PS256'
  | 'PS384'
  | 'PS512'
  | 'ES256'
  | 'ES384'
  | 'ES512'
  | 'EdDSA';

/**
 * Per-URI JWKS cache entry with expiration timestamp.
 * When the entry expires, a new JWKS middleware is fetched on the next request.
 */
type JwkCacheEntry = {
  /** The cached JWKS middleware instance. */
  middleware: ReturnType<typeof import('hono/jwk').jwk>;
  /** Timestamp (Date.now()) when this cache entry expires. */
  expiresAt: number;
  /** JWT algorithms used when creating this middleware. */
  algorithms: string[];
};

/** Cache of JWKS middleware instances keyed by JWKS URI. */
const jwkCache = new Map<string, JwkCacheEntry>();

/** In-flight promise map for concurrent JWKS fetch coalescing. */
const jwkFetchLocks = new Map<string, Promise<ReturnType<typeof import('hono/jwk').jwk>>>();

/** In-flight promise map for concurrent JWKS refresh coalescing. */
const jwkRefreshLocks = new Map<string, Promise<void>>();

/**
 * Insert a JWKS cache entry, evicting the oldest entry (FIFO) when the cache
 * is full (exceeds MAX_JWK_CACHE).
 */
function setJwkCacheEntry(
  jwksUri: string,
  expiresAt: number,
  middleware: ReturnType<typeof import('hono/jwk').jwk>,
  algorithms: string[],
): void {
  if (jwkCache.size >= MAX_JWK_CACHE) {
    const firstKey = jwkCache.keys().next().value;
    if (firstKey) jwkCache.delete(firstKey);
  }
  jwkCache.set(jwksUri, { algorithms, expiresAt, middleware });
}

/**
 * Evict the oldest lock map entry (FIFO) when the map exceeds MAX_JWK_LOCKS.
 * Prevents unbounded memory growth during concurrent JWKS fetches or refreshes.
 */
function evictLock(map: Map<string, Promise<unknown>>): void {
  if (map.size >= MAX_JWK_LOCKS) {
    const firstKey = map.keys().next().value;
    if (firstKey) map.delete(firstKey);
  }
}

/**
 * Retrieve a cached JWKS middleware instance for the given URI, fetching and caching a new one if stale.
 * Caches middleware with TTL eviction; returns a fresh instance in tests.
 * @param jwksUri - The JWKS endpoint URL.
 * @returns The JWKS middleware function.
 */
async function getCachedJwkMiddleware(
  jwksUri: string,
  algorithms?: string[],
): Promise<ReturnType<typeof import('hono/jwk').jwk>> {
  const alg = (algorithms ?? ['RS256']) as AsymmetricAlgorithm[];
  if (typeof vi !== 'undefined') {
    const { jwk } = await import('hono/jwk');
    return jwk({
      alg,
      jwks_uri: jwksUri,
    });
  }

  const now = Date.now();
  const cached = jwkCache.get(jwksUri);
  if (cached && cached.expiresAt > now) {
    return cached.middleware;
  }

  const existing = jwkFetchLocks.get(jwksUri);
  if (existing) {
    return existing;
  }

  jwkCache.delete(jwksUri);

  evictLock(jwkFetchLocks);

  const fetchPromise = (async () => {
    try {
      const { jwk } = await import('hono/jwk');
      const middleware = jwk({
        alg,
        jwks_uri: jwksUri,
      });
      setJwkCacheEntry(jwksUri, now + JWKS_CACHE_TTL_MS, middleware, alg);
      return middleware;
    } finally {
      jwkFetchLocks.delete(jwksUri);
    }
  })();
  jwkFetchLocks.set(jwksUri, fetchPromise);
  return fetchPromise;
}

/** Periodically evict stale JWKS cache entries every 10 minutes. */
const jwkSweepTimer =
  typeof vi !== 'undefined'
    ? null
    : setInterval(() => {
        const now = Date.now();
        for (const [uri, entry] of jwkCache.entries()) {
          if (entry.expiresAt <= now) {
            jwkCache.delete(uri);
          }
        }
      }, 600_000); // 10 minutes
jwkSweepTimer?.unref();

/** Background refresh: fetch fresh middleware for entries past half-life. */
const jwkBackgroundRefreshTimer =
  typeof vi !== 'undefined'
    ? null
    : setInterval(async () => {
        const now = Date.now();
        const halfLife = JWKS_CACHE_TTL_MS / 2;
        for (const [uri, entry] of jwkCache.entries()) {
          if (entry.expiresAt - now <= halfLife) {
            const existing = jwkRefreshLocks.get(uri);
            if (existing) {
              await existing;
              continue;
            }
            evictLock(jwkRefreshLocks);

            const refreshPromise = (async () => {
              try {
                const { jwk } = await import('hono/jwk');
                const alg = entry.algorithms as AsymmetricAlgorithm[];
                const middleware = jwk({
                  alg,
                  jwks_uri: uri,
                });
                setJwkCacheEntry(uri, now + JWKS_CACHE_TTL_MS, middleware, alg);
              } catch {
                // Fire-and-forget: don't block other refreshes
              } finally {
                jwkRefreshLocks.delete(uri);
              }
            })();
            jwkRefreshLocks.set(uri, refreshPromise);
          }
        }
      }, JWKS_CACHE_TTL_MS / 2); // 30 minutes
jwkBackgroundRefreshTimer?.unref();

/**
 * Check whether the JWT audience claim matches the expected value.
 * Supports both string and array `aud` claim types per JWT spec.
 */
function matchesAudience(payload: Record<string, unknown>, audience: string): boolean {
  const aud = payload.aud;
  if (aud === undefined) return false;
  if (typeof aud === 'string') return aud === audience;
  if (Array.isArray(aud)) return aud.includes(audience);
  return false;
}

/**
 * Extract JWT claims from a Bearer token using configurable algorithm verification.
 * Tries each algorithm sequentially; the first algorithm that produces a valid payload
 * (and passes audience check) is accepted.
 * @typeParam TClaims - The type of the decoded JWT claims object.
 * @param c - The Hono context.
 * @param secret - The JWT signing secret.
 * @param audience - Optional expected audience claim.
 * @param algorithms - JWT algorithms accepted. Defaults to ['HS256'].
 * @returns The decoded claims or null if extraction fails.
 */
export async function extractBearerClaims<TClaims = unknown>(
  c: Context,
  secret: string,
  audience?: string,
  algorithms?: string[],
): Promise<TClaims | null> {
  const authHeader = c.req.header('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.slice(7);
  const alg = algorithms && algorithms.length > 0 ? algorithms : ['HS256'];
  for (const algorithm of alg) {
    try {
      const payload = await verify(
        token,
        secret,
        algorithm as
          | 'HS256'
          | 'HS384'
          | 'HS512'
          | 'RS256'
          | 'RS384'
          | 'RS512'
          | 'ES256'
          | 'ES384'
          | 'ES512'
          | 'PS256'
          | 'PS384'
          | 'PS512'
          | 'EdDSA',
      );
      if (audience && !matchesAudience(payload as Record<string, unknown>, audience)) {
        return null;
      }
      return payload as TClaims;
    } catch {
      // Try next algorithm
    }
  }
  return null;
}

/**
 * Extract JWT claims from a Bearer token using JWKS verification.
 * @typeParam TClaims - The type of the decoded JWT claims object.
 * @param c - The Hono context.
 * @param jwksUri - The JWKS endpoint URL.
 * @param audience - Optional expected audience claim.
 * @param algorithms - Optional JWT algorithms accepted. Defaults to ['RS256'].
 * @returns The decoded claims or null if extraction fails.
 */
export async function extractJwksClaims<TClaims = unknown>(
  c: Context,
  jwksUri: string,
  audience?: string,
  algorithms?: string[],
): Promise<TClaims | null> {
  const authHeader = c.req.header('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }
  const _token = authHeader.slice(7);
  try {
    const jwkMiddleware = await getCachedJwkMiddleware(jwksUri, algorithms);
    await jwkMiddleware(c, async () => {});
    const payload = c.get('jwtPayload') as TClaims | undefined;
    if (!payload) return null;
    if (audience && !matchesAudience(payload as Record<string, unknown>, audience)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
