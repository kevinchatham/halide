import type { Logger } from '../types/app';

/**
 * Internal cache entry for a resolved JWT secret with expiration timestamp.
 * @property expiresAt - Timestamp (Date.now()) when this cache entry expires.
 * @property value - The resolved secret string.
 */
interface CachedSecret {
  /** Timestamp (Date.now()) when this cache entry expires. After this time the cache is invalidated. */
  expiresAt: number;
  /** The resolved secret string. */
  value: string;
}

/**
 * Create a caching resolver for JWT secrets.
 *
 * Returns an async function that accepts a secret fetcher callback. When the
 * fetcher is called, the result is cached until TTL expires. If TTL is 0,
 * caching is disabled and the fetcher is called every time.
 *
 * @typeParam TLogScope - The type of the structured log scope object.
 * @param ttlSeconds - Time-to-live for cached secrets in seconds.
 * @param logger - Logger instance.
 * @returns An async function that resolves secrets with caching, accepting a fetcher callback.
 */
export function createSecretCache<TLogScope = unknown>(
  ttlSeconds: number,
  logger: Logger<TLogScope>,
): (fetcher: () => string | Promise<string>) => Promise<string> {
  let cache: CachedSecret | null = null;
  let pendingPromise: Promise<string> | null = null;

  /** Resolve a JWT secret from the fetcher, using the cache when TTL has not expired. */
  return async function resolveSecret(fetcher: () => string | Promise<string>): Promise<string> {
    if (ttlSeconds <= 0) return fetcher();

    const now = Date.now();
    if (cache && now < cache.expiresAt) {
      return cache.value;
    }

    if (pendingPromise) return pendingPromise;

    pendingPromise = (async () => {
      const freshNow = Date.now();
      try {
        const value = await fetcher();
        cache = { expiresAt: freshNow + ttlSeconds * 1000, value };
        return value;
      } catch (err) {
        logger.error(
          { error: 'secret_refresh_failed' } as TLogScope,
          'Failed to refresh JWT secret from secret provider:',
          err instanceof Error ? err.message : String(err),
        );
        throw err;
      } finally {
        pendingPromise = null;
      }
    })();
    return pendingPromise;
  };
}
