import type { Request, RequestHandler } from 'express';

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

interface WindowEntry {
  count: number;
  resetTime: number;
}

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    const first = forwarded.split(',')[0];
    if (first) {
      return first.trim();
    }
  }
  return req.ip || 'unknown';
}

export function createRateLimitMiddleware(config: RateLimitConfig): {
  middleware: RequestHandler;
  dispose: () => void;
} {
  const store = new Map<string, WindowEntry>();

  const sweep = () => {
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

  const middleware: RequestHandler = (req, res, next) => {
    const clientIp = getClientIp(req);
    const now = Date.now();
    const entry = store.get(clientIp);

    if (!entry || now > entry.resetTime) {
      store.set(clientIp, {
        count: 1,
        resetTime: now + config.windowMs,
      });
      return next();
    }

    entry.count += 1;

    if (entry.count > config.maxRequests) {
      const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
      res.set('Retry-After', String(retryAfter));
      res.status(429).json({ error: 'Too Many Requests' });
      return;
    }

    next();
  };

  return {
    middleware,
    dispose: () => clearInterval(timer),
  };
}
