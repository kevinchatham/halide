import type { Context, Next } from 'hono';

/** Configuration for rate limiting. */
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

/** Internal storage for rate limit tracking per client IP. */
interface WindowEntry {
  /** Number of requests in current window. */
  count: number;
  /** Timestamp (Date.now()) when the window resets. */
  resetTime: number;
}

/** Check if the socket IP matches a trusted proxy CIDR or exact IP. */
function isTrustedProxy(ip: string | undefined, trustedProxies?: string[]): boolean {
  if (!trustedProxies?.length || !ip) return false;
  return trustedProxies.some((tp) => {
    if (tp.includes('/')) {
      const parts = tp.split('/');
      const net = parts[0]!;
      const prefix = parts[1]!;
      const prefixLen = Number.parseInt(prefix, 10);
      return ip.startsWith(net.substring(0, net.length - (32 - prefixLen) / 8));
    }
    return ip === tp;
  });
}

/** Extract client IP from request headers, falling back to socket IP. Uses X-Forwarded-For only when the socket IP is from a trusted proxy. */
function getClientIp(c: Context, trustedProxies?: string[]): string {
  const nodeReq = c.req as { socket?: { remoteAddress?: string } };
  const socketIp = nodeReq.socket?.remoteAddress || 'unknown';
  if (isTrustedProxy(socketIp, trustedProxies)) {
    const forwarded = c.req.header('x-forwarded-for');
    if (forwarded) {
      const first = forwarded.split(',')[0];
      if (first) return first.trim();
    }
  }
  return socketIp;
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
  const store = new Map<string, WindowEntry>();

  /** Evict oldest entry when store exceeds maxEntries. */
  const evictOldest = (): void => {
    if (!config.maxEntries || store.size < config.maxEntries) return;
    const firstKey = store.keys().next().value!;
    store.delete(firstKey);
  };

  /** Remove expired entries from the rate limit store. */
  const sweep = (): void => {
    const now = Date.now();
    for (const ip of store.keys()) {
      const entry = store.get(ip);
      if (entry && now > entry.resetTime) {
        store.delete(ip);
      }
    }
  };

  const sweepInterval = Math.max(config.windowMs * 2, 60_000);
  const timer = setInterval(sweep, sweepInterval);
  timer.unref();

  /** Per-request rate limit check: returns 429 if the client IP has exceeded its window quota. */
  const middleware = async (c: Context, next: Next): Promise<Response | undefined> => {
    const clientIp = getClientIp(c, config.trustedProxies);
    const now = Date.now();
    const entry = store.get(clientIp);

    if (!entry || now > entry.resetTime) {
      evictOldest();
      store.set(clientIp, {
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
