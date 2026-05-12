import { Hono } from 'hono';
import { createRateLimitMiddleware } from './rateLimit';

describe('createRateLimitMiddleware', () => {
  let disposeFns: Array<() => void>;

  beforeEach(() => {
    disposeFns = [];
  });

  afterEach(() => {
    for (const dispose of disposeFns) {
      dispose();
    }
  });

  function createApp(
    config: {
      maxEntries?: number;
      windowMs: number;
      maxRequests: number;
      trustedProxies?: string[];
    },
    socketIp?: string,
  ): Hono {
    const app = new Hono();
    const { middleware, dispose } = createRateLimitMiddleware(config);
    disposeFns.push(dispose);

    // Wrap middleware to inject socket IP for testing
    const wrappedMiddleware = async (
      c: Parameters<typeof middleware>[0],
      next: Parameters<typeof middleware>[1],
    ): Promise<Response | undefined> => {
      if (socketIp) {
        const nodeReq = c.req as { socket?: { remoteAddress?: string } };
        nodeReq.socket = { remoteAddress: socketIp };
      }
      return middleware(c, next);
    };

    app.use('*', wrappedMiddleware);
    app.get('/test', (c) => c.json({ ok: true }));
    return app;
  }

  it('allows requests within the limit', async () => {
    const app = createApp({ maxRequests: 2, windowMs: 1000 }, '127.0.0.1');

    const res = await app.request('/test', {
      headers: { 'x-forwarded-for': '127.0.0.1' },
    });

    expect(res.status).toBe(200);
  });

  it('blocks requests exceeding the limit', async () => {
    const app = createApp({ maxRequests: 2, windowMs: 1000 }, '127.0.0.1');
    const headers = { 'x-forwarded-for': '127.0.0.1' };

    await app.request('/test', { headers });
    await app.request('/test', { headers });
    const res = await app.request('/test', { headers });

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body).toEqual({ error: 'Too Many Requests' });
  });

  it('includes Retry-After header on 429 response', async () => {
    const app = createApp({ maxRequests: 1, windowMs: 1000 }, '127.0.0.1');
    const headers = { 'x-forwarded-for': '127.0.0.1' };

    await app.request('/test', { headers });
    const res = await app.request('/test', { headers });

    expect(res.headers.get('Retry-After')).toBeTruthy();
  });

  it('resets window after time expires', async () => {
    vi.useFakeTimers();
    const app = createApp({ maxRequests: 1, windowMs: 1000 }, '127.0.0.1');
    const headers = { 'x-forwarded-for': '127.0.0.1' };

    const res1 = await app.request('/test', { headers });
    expect(res1.status).toBe(200);

    const res2 = await app.request('/test', { headers });
    expect(res2.status).toBe(429);

    vi.advanceTimersByTime(1100);

    const res3 = await app.request('/test', { headers });
    expect(res3.status).toBe(200);

    vi.useRealTimers();
  });

  it('tracks different IPs separately', async () => {
    const app1 = createApp({ maxRequests: 1, windowMs: 1000 }, '127.0.0.1');
    const app2 = createApp({ maxRequests: 1, windowMs: 1000 }, '192.168.1.1');

    const res1 = await app1.request('/test', {
      headers: { 'x-forwarded-for': '127.0.0.1' },
    });
    const res2 = await app2.request('/test', {
      headers: { 'x-forwarded-for': '192.168.1.1' },
    });

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
  });

  it('uses X-Forwarded-For for client identification when trusted proxy', async () => {
    const app = createApp(
      { maxRequests: 1, trustedProxies: ['127.0.0.1'], windowMs: 1000 },
      '127.0.0.1',
    );
    const headers = { 'x-forwarded-for': '10.0.0.1' };

    const res1 = await app.request('/test', { headers });
    const res2 = await app.request('/test', { headers });

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(429);
  });

  it('ignores X-Forwarded-For when not from trusted proxy', async () => {
    const app = createApp({ maxRequests: 1, windowMs: 1000 }, '192.168.1.100');
    const headers = { 'x-forwarded-for': '10.0.0.1' };

    const res1 = await app.request('/test', { headers });
    const res2 = await app.request('/test', { headers });

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(429);
  });

  it('falls back to socket IP when no x-forwarded-for', async () => {
    const app = createApp({ maxRequests: 1, windowMs: 1000 }, '10.0.0.1');

    const res1 = await app.request('/test');
    expect(res1.status).toBe(200);
  });

  it('handles x-forwarded-for with multiple IPs when trusted', async () => {
    const app = createApp(
      { maxRequests: 1, trustedProxies: ['127.0.0.1'], windowMs: 1000 },
      '127.0.0.1',
    );

    const res1 = await app.request('/test', {
      headers: { 'x-forwarded-for': '10.0.0.1, 10.0.0.2, 10.0.0.3' },
    });
    const res2 = await app.request('/test', {
      headers: { 'x-forwarded-for': '10.0.0.1, 10.0.0.2' },
    });

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(429);
  });

  it('dispose function clears the timer', () => {
    const { dispose } = createRateLimitMiddleware({ maxRequests: 10, windowMs: 1000 });
    expect(dispose).toBeDefined();
    expect(() => dispose()).not.toThrow();
  });

  it('sweeps expired entries after window expires', async () => {
    vi.useFakeTimers();
    const app = createApp({ maxRequests: 1, windowMs: 1000 }, '127.0.0.1');
    const headers = { 'x-forwarded-for': '127.0.0.1' };

    await app.request('/test', { headers });
    const res2 = await app.request('/test', { headers });
    expect(res2.status).toBe(429);

    vi.advanceTimersByTime(200_000);

    const res3 = await app.request('/test', { headers });
    expect(res3.status).toBe(200);

    vi.useRealTimers();
  });

  it('tracks CIDR trusted proxies', async () => {
    const app = createApp(
      { maxRequests: 1, trustedProxies: ['10.0.0.0/24'], windowMs: 1000 },
      '10.0.0.50',
    );

    const res1 = await app.request('/test', {
      headers: { 'x-forwarded-for': '10.0.0.100' },
    });
    const res2 = await app.request('/test', {
      headers: { 'x-forwarded-for': '10.0.0.100' },
    });

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(429);
  });

  it('evicts oldest entries when maxEntries is exceeded', async () => {
    const app = createApp({ maxEntries: 2, maxRequests: 10, windowMs: 60_000 }, '127.0.0.1');

    const ips = ['10.0.0.1', '10.0.0.2', '10.0.0.3'];
    const results: number[] = [];
    for (const ip of ips) {
      const res = await app.request('/test', {
        headers: { 'x-forwarded-for': ip },
      });
      results.push(res.status);
    }

    expect(results[0]).toBe(200);
    expect(results[1]).toBe(200);
    expect(results[2]).toBe(200);
  });
});
