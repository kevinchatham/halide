import type { Logger } from '../types';

/** Internal cache entry for a resolved JWT secret. */
interface CachedSecret {
  /** Timestamp (Date.now()) when this cache entry expires. */
  expiresAt: number;
  /** The resolved secret string. */
  value: string;
}

/**
 * Create a caching resolver for JWT secrets.
 * @param ttlSeconds - Time-to-live for cached secrets in seconds.
 * @param logger - Logger instance.
 * @returns An async function that resolves secrets with caching, accepting a fetcher callback.
 */
export function createSecretCache(
  ttlSeconds: number,
  logger: Logger,
): (fetcher: () => string | Promise<string>) => Promise<string> {
  let cache: CachedSecret | null = null;

  /** Resolve a JWT secret, using the cache when TTL has not expired. */
  return async function resolveSecret(fetcher: () => string | Promise<string>): Promise<string> {
    if (ttlSeconds <= 0) return fetcher();

    const now = Date.now();
    if (cache && now < cache.expiresAt) return cache.value;

    try {
      const value = await fetcher();
      cache = { expiresAt: now + ttlSeconds * 1000, value };
      return value;
    } catch (err) {
      logger.error(
        'Failed to refresh JWT secret from secret provider:',
        err instanceof Error ? err.message : String(err),
      );
      throw err;
    }
  };
}
