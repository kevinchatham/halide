import type { Logger } from '../types';

interface CachedSecret {
  expiresAt: number;
  value: string;
}

export function createSecretCache(
  ttlSeconds: number,
  logger: Logger,
): (fetcher: () => string | Promise<string>) => Promise<string> {
  let cache: CachedSecret | null = null;

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
