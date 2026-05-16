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

type JwkCacheEntry = {
  middleware: ReturnType<typeof import('hono/jwk').jwk>;
  expiresAt: number;
  algorithms: string[];
};

const jwkCache = new Map<string, JwkCacheEntry>();

const jwkFetchLocks = new Map<string, Promise<ReturnType<typeof import('hono/jwk').jwk>>>();

const jwkRefreshLocks = new Map<string, Promise<void>>();

/** Cache a JWKS middleware instance with its expiration timestamp. */
function setJwkCacheEntry(
  jwksUri: string,
  expiresAt: number,
  middleware: ReturnType<typeof import('hono/jwk').jwk>,
  algorithms: string[],
): void {
  if (jwkCache.size >= MAX_JWK_CACHE) {
    const oldestKey = jwkCache.keys().next().value;
    if (oldestKey) jwkCache.delete(oldestKey);
  }
  jwkCache.set(jwksUri, { algorithms, expiresAt, middleware });
}

/** Evict the oldest entry when a lock map reaches MAX_JWK_LOCKS. */
function evictLock(map: Map<string, Promise<unknown>>): void {
  if (map.size >= MAX_JWK_LOCKS) {
    const firstKey = map.keys().next().value;
    if (firstKey) map.delete(firstKey);
  }
}

/**
 * Get or create a cached JWKS middleware instance for the given URI.
 *
 * Returns the cached middleware if it hasn't expired. Creates a new one
 * with deduplication via fetch locks to avoid concurrent JWKS fetches.
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
      }, 600_000);
jwkSweepTimer?.unref();

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
                // Fire-and-forget: background refresh errors are intentionally suppressed
              } finally {
                jwkRefreshLocks.delete(uri);
              }
            })();
            jwkRefreshLocks.set(uri, refreshPromise);
          }
        }
      }, JWKS_CACHE_TTL_MS / 2);
jwkBackgroundRefreshTimer?.unref();

/** Check whether the JWT audience claim matches the expected value. */
function matchesAudience(payload: Record<string, unknown>, audience: string): boolean {
  const aud = payload.aud;
  if (aud === undefined) return false;
  if (typeof aud === 'string') return aud === audience;
  if (Array.isArray(aud)) return aud.includes(audience);
  return false;
}

/** Decode the JWT header (first segment) without verification. Returns null on failure. */
function decodeJwtHeader(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const base64url = parts[0] as string;
    const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
    const padding = 4 - (base64.length % 4);
    const padded = padding === 4 ? base64 : base64 + '='.repeat(padding);
    const decoded = atob(padded);
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Resolve the JWT signing algorithm from the header, checking against allowed algorithms. */
function resolveAlgorithm(token: string, allowedAlgorithms: string[]): string | null {
  const header = decodeJwtHeader(token);
  if (!header) return null;
  const alg = header.alg;
  if (typeof alg !== 'string') return null;
  if (!allowedAlgorithms.includes(alg)) return null;
  return alg;
}

/**
 * Extract JWT claims from the Authorization header using HS256 (or specified) signing algorithm.
 *
 * Reads the `authorization` header, resolves the signing algorithm by inspecting the
 * JWT header, verifies the signature with the provided secret, and checks the audience
 * claim when configured. Returns `null` when no valid bearer token is present or
 * verification fails.
 *
 * @typeParam TClaims - The type of the decoded JWT claims.
 * @param c - The Hono context.
 * @param secret - The JWT signing secret.
 * @param audience - Expected audience claim value.
 * @param algorithms - Allowed signing algorithms. Defaults to `['HS256']`.
 * @returns The decoded JWT claims, or `null` when extraction fails.
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
  const allowedAlgorithms = algorithms && algorithms.length > 0 ? algorithms : ['HS256'];

  const algorithm = resolveAlgorithm(token, allowedAlgorithms);
  if (!algorithm) return null;

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
    return null;
  }
}

/**
 * Extract JWT claims from the Authorization header using JWKS-based verification.
 *
 * Reads the `authorization` header, fetches the JWKS endpoint (cached), runs the
 * hono/jwk middleware to verify the token, and checks the audience claim when
 * configured. Returns `null` when no valid bearer token is present or verification fails.
 *
 * @typeParam TClaims - The type of the decoded JWT claims.
 * @param c - The Hono context.
 * @param jwksUri - JWKS endpoint URL.
 * @param audience - Expected audience claim value.
 * @param algorithms - Allowed signing algorithms.
 * @returns The decoded JWT claims, or `null` when extraction fails.
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
