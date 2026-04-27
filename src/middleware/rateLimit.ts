import type { Context, Next } from 'hono';

/** Configuration for rate limiting. */
interface RateLimitConfig {
  /** Maximum requests allowed per window. */
  maxRequests: number;
  /** Time window in milliseconds. */
  windowMs: number;
}

/** Internal storage for rate limit tracking. */
interface WindowEntry {
  /** Number of requests in current window. */
  count: number;
  /** Timestamp when the window resets. */
  resetTime: number;
}

/** Extract client IP from request headers (supports X-Forwarded-For). */
function getClientIp(c: Context): string {
  const forwarded = c.req.header('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0];
    if (first) return first.trim();
  }
  return 'unknown';
}

/**
 * Create rate limiting middleware that restricts requests per client IP.
 * @param config - Rate limit configuration (maxRequests and windowMs).
 * @returns Object containing the middleware and a dispose function for cleanup.
 */
export function createRateLimitMiddleware(config: RateLimitConfig): {
  middleware: (c: Context, next: Next) => Promise<Response | undefined>;
  dispose: () => void;
} {
  const store = new Map<string, WindowEntry>();

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
    const clientIp = getClientIp(c);
    const now = Date.now();
    const entry = store.get(clientIp);

    if (!entry || now > entry.resetTime) {
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
