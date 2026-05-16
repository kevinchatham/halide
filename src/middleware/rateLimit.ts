import type { Context, Next } from 'hono';
import { getClientIp } from '../utils/trustedProxies';

/** Default maximum number of entries in the in-memory rate limit store (10,000). */
const DEFAULT_MAX_ENTRIES = 10_000;

/** Minimal Redis client interface for rate limiting. */
export interface RedisClient {
  del(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  get(key: string): Promise<string | null>;
  incr(key: string): Promise<number>;
  pttl(key: string): Promise<number>;
  set(key: string, value: string, opts?: { EX?: number }): Promise<'OK'>;
}

/**
 * Create a Redis-backed rate limit store implementation.
 *
 * Uses Redis for distributed rate limiting across multiple server instances.
 * Each client IP gets a key with a TTL matching the window duration.
 *
 * @param client - A Redis client implementing the RedisClient interface.
 * @param config - Rate limit configuration (maxRequests and windowMs).
 * @returns Object containing the middleware and a dispose function.
 */
export function createRedisRateLimitStore(
  client: RedisClient,
  config: Omit<RateLimitConfig, 'maxEntries'>,
): {
  middleware: (c: Context, next: Next) => Promise<Response | undefined>;
  dispose: () => void;
} {
  const windowSeconds = Math.ceil(config.windowMs / 1000);

  const middleware = async (c: Context, next: Next): Promise<Response | undefined> => {
    const nodeReq = c.req as { socket?: { remoteAddress?: string } };
    const socketIp = nodeReq.socket?.remoteAddress || 'unknown';
    const forwarded = c.req.header('x-forwarded-for');
    const clientIp = getClientIp(socketIp, config.trustedProxies, forwarded);
    const key = `rate-limit:${clientIp}`;

    const count = await client.incr(key);

    if (count === 1) {
      await client.expire(key, windowSeconds);
    }

    if (count > config.maxRequests) {
      const pttl = await client.pttl(key);
      const retryAfter = pttl > 0 ? Math.ceil(pttl / 1000) : 1;
      c.header('Retry-After', String(retryAfter));
      return c.json({ error: 'Too Many Requests' }, 429);
    }

    await next();
  };

  return {
    dispose: () => {
      // No-op: Redis keys are cleaned up by TTL.
    },
    middleware,
  };
}

/**
 * Interface for rate limit storage backends.
 *
 * Implementations can use Redis, DynamoDB, or any other distributed store
 * to share rate limit state across multiple server instances.
 */
interface RateLimitStore {
  /** Remove the entry for the given key. */
  delete(key: string): Promise<void>;
  /** Retrieve the current window entry for a key, or undefined if not found. */
  get(key: string): Promise<WindowEntry | undefined>;
  /** Store a window entry for the given key. */
  set(key: string, entry: WindowEntry): Promise<void>;
  /** Remove expired entries from the store. Called periodically by the middleware. */
  sweep(now: number): Promise<void>;
}

/**
 * Configuration for the in-memory rate limit store.
 */
interface RateLimitConfig {
  /** Maximum number of entries in the store. Oldest entries are evicted when exceeded. */
  maxEntries?: number;
  /** Maximum requests allowed per window. */
  maxRequests: number;
  /** Trusted proxy IPs/CIDRs for x-forwarded-for header validation. */
  trustedProxies?: string[];
  /** Time window in milliseconds. */
  windowMs: number;
}

/**
 * Internal storage for rate limit tracking per client IP.
 */
interface WindowEntry {
  /** Number of requests in current window. */
  count: number;
  /** Timestamp (Date.now()) when the window resets. */
  resetTime: number;
}

/**
 * Create an in-memory rate limit store with LRU eviction.
 *
 * Uses a Map with LRU eviction when maxEntries is configured.
 * Suitable for single-instance deployments.
 *
 * @param maxEntries - Maximum number of entries. Oldest entries are evicted when exceeded.
 * @returns A RateLimitStore implementation.
 */
function createMemoryStore(maxEntries: number = DEFAULT_MAX_ENTRIES): RateLimitStore {
  const store = new Map<string, WindowEntry>();

  return {
    async delete(key: string): Promise<void> {
      store.delete(key);
    },
    async get(key: string): Promise<WindowEntry | undefined> {
      return store.get(key);
    },
    async set(key: string, entry: WindowEntry): Promise<void> {
      if (maxEntries && store.size >= maxEntries) {
        const firstKey = store.keys().next().value;
        if (firstKey) store.delete(firstKey);
      }
      store.set(key, entry);
    },
    async sweep(now: number): Promise<void> {
      for (const [key, entry] of store.entries()) {
        if (now > entry.resetTime) {
          store.delete(key);
        }
      }
    },
  };
}

/**
 * Create rate limiting middleware that restricts requests per client IP.
 *
 * Uses an in-memory store with periodic cleanup. Returns 429 when the client
 * has exceeded its window quota. The dispose function clears the cleanup timer.
 *
 * @param config - Rate limit configuration (maxRequests and windowMs).
 * @returns Object containing the middleware and a dispose function for cleanup.
 */
export function createRateLimitMiddleware(config: RateLimitConfig): {
  middleware: (c: Context, next: Next) => Promise<Response | undefined>;
  dispose: () => void;
} {
  const store = createMemoryStore(config.maxEntries);

  const sweepInterval = Math.min(Math.max(config.windowMs * 2, 60_000), 1_800_000);
  const timer = setInterval(() => {
    const now = Date.now();
    void store.sweep(now);
  }, sweepInterval);
  timer.unref();

  /** Per-request rate limit check: returns 429 if the client IP has exceeded its window quota. */
  const middleware = async (c: Context, next: Next): Promise<Response | undefined> => {
    const nodeReq = c.req as { socket?: { remoteAddress?: string } };
    const socketIp = nodeReq.socket?.remoteAddress || 'unknown';
    const forwarded = c.req.header('x-forwarded-for');
    const clientIp = getClientIp(socketIp, config.trustedProxies, forwarded);
    const now = Date.now();
    const entry = await store.get(clientIp);

    if (!entry || now > entry.resetTime) {
      await store.set(clientIp, {
        count: 1,
        resetTime: now + config.windowMs,
      });
      await next();
      return;
    }

    entry.count += 1;

    if (entry.count > config.maxRequests) {
      const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
      c.header('Retry-After', String(retryAfter));
      return c.json({ error: 'Too Many Requests' }, 429);
    }

    await next();
  };

  return {
    dispose: () => clearInterval(timer),
    middleware,
  };
}
