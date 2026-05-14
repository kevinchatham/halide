import type { Context } from 'hono';
import { verify } from 'hono/jwt';
import { JWKS_CACHE_TTL_MS, MAX_JWK_CACHE } from '../config/constants.js';

/** Per-URI JWKS cache entry with TTL. */
type JwkCacheEntry = {
  middleware: ReturnType<typeof import('hono/jwk').jwk>;
  expiresAt: number;
};

const jwkCache = new Map<string, JwkCacheEntry>();
const jwkFetchLocks = new Map<string, Promise<ReturnType<typeof import('hono/jwk').jwk>>>();
const jwkRefreshLocks = new Map<string, Promise<void>>();

/** Enforce MAX_JWK_CACHE before inserting a new entry, evicting the oldest (FIFO). */
function setJwkCacheEntry(
  jwksUri: string,
  expiresAt: number,
  middleware: ReturnType<typeof import('hono/jwk').jwk>,
): void {
  if (jwkCache.size >= MAX_JWK_CACHE) {
    const firstKey = jwkCache.keys().next().value;
    if (firstKey) jwkCache.delete(firstKey);
  }
  jwkCache.set(jwksUri, { expiresAt, middleware });
}

/**
 * Get a JWKS middleware instance for the given JWKS URI.
 * Caches middleware with TTL eviction; returns a fresh instance in tests.
 * @param jwksUri - The JWKS endpoint URL.
 * @returns The JWKS middleware function.
 */
async function getCachedJwkMiddleware(
  jwksUri: string,
): Promise<ReturnType<typeof import('hono/jwk').jwk>> {
  if (typeof vi !== 'undefined') {
    const { jwk } = await import('hono/jwk');
    return jwk({
      alg: ['RS256'],
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

  const fetchPromise = (async () => {
    try {
      const { jwk } = await import('hono/jwk');
      const middleware = jwk({
        alg: ['RS256'],
        jwks_uri: jwksUri,
      });
      setJwkCacheEntry(jwksUri, now + JWKS_CACHE_TTL_MS, middleware);
      return middleware;
    } finally {
      jwkFetchLocks.delete(jwksUri);
    }
  })();
  jwkFetchLocks.set(jwksUri, fetchPromise);
  return fetchPromise;
}

/** Periodically evict stale JWKS cache entries. */
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
            const refreshPromise = (async () => {
              try {
                const { jwk } = await import('hono/jwk');
                const middleware = jwk({
                  alg: ['RS256'],
                  jwks_uri: uri,
                });
                setJwkCacheEntry(uri, now + JWKS_CACHE_TTL_MS, middleware);
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

/** Check whether the JWT audience claim matches the expected value. */
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
 * @returns The decoded claims or null if extraction fails.
 */
export async function extractJwksClaims<TClaims = unknown>(
  c: Context,
  jwksUri: string,
  audience?: string,
): Promise<TClaims | null> {
  const authHeader = c.req.header('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }
  const _token = authHeader.slice(7);
  try {
    const jwkMiddleware = await getCachedJwkMiddleware(jwksUri);
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
