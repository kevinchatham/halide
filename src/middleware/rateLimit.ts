import type { Context, Next } from 'hono';

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

interface WindowEntry {
  count: number;
  resetTime: number;
}

function getClientIp(c: Context): string {
  const forwarded = c.req.header('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0];
    if (first) return first.trim();
  }
  return 'unknown';
}

export function createRateLimitMiddleware(config: RateLimitConfig): {
  middleware: (c: Context, next: Next) => Promise<Response | undefined>;
  dispose: () => void;
} {
  const store = new Map<string, WindowEntry>();

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
