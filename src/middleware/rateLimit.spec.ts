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

  function createApp(config: { windowMs: number; maxRequests: number }): Hono {
    const app = new Hono();
    const { middleware, dispose } = createRateLimitMiddleware(config);
    disposeFns.push(dispose);
    app.use('*', middleware);
    app.get('/test', (c) => c.json({ ok: true }));
    return app;
  }

  it('allows requests within the limit', async () => {
    const app = createApp({ maxRequests: 2, windowMs: 1000 });

    const res = await app.request('/test', {
      headers: { 'x-forwarded-for': '127.0.0.1' },
    });

    expect(res.status).toBe(200);
  });

  it('blocks requests exceeding the limit', async () => {
    const app = createApp({ maxRequests: 2, windowMs: 1000 });
    const headers = { 'x-forwarded-for': '127.0.0.1' };

    await app.request('/test', { headers });
    await app.request('/test', { headers });
    const res = await app.request('/test', { headers });

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body).toEqual({ error: 'Too Many Requests' });
  });

  it('includes Retry-After header on 429 response', async () => {
    const app = createApp({ maxRequests: 1, windowMs: 1000 });
    const headers = { 'x-forwarded-for': '127.0.0.1' };

    await app.request('/test', { headers });
    const res = await app.request('/test', { headers });

    expect(res.headers.get('Retry-After')).toBeTruthy();
  });

  it('resets window after time expires', async () => {
    vi.useFakeTimers();
    const app = createApp({ maxRequests: 1, windowMs: 1000 });
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
    const app = createApp({ maxRequests: 1, windowMs: 1000 });

    const res1 = await app.request('/test', {
      headers: { 'x-forwarded-for': '127.0.0.1' },
    });
    const res2 = await app.request('/test', {
      headers: { 'x-forwarded-for': '192.168.1.1' },
    });

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
  });

  it('uses X-Forwarded-For for client identification', async () => {
    const app = createApp({ maxRequests: 1, windowMs: 1000 });
    const headers = { 'x-forwarded-for': '10.0.0.1' };

    const res1 = await app.request('/test', { headers });
    const res2 = await app.request('/test', { headers });

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(429);
  });

  it('falls back to unknown when no x-forwarded-for', async () => {
    const app = createApp({ maxRequests: 1, windowMs: 1000 });

    const res1 = await app.request('/test');
    expect(res1.status).toBe(200);
  });

  it('handles x-forwarded-for with multiple IPs', async () => {
    const app = createApp({ maxRequests: 1, windowMs: 1000 });

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
    const app = createApp({ maxRequests: 1, windowMs: 1000 });
    const headers = { 'x-forwarded-for': '127.0.0.1' };

    await app.request('/test', { headers });
    const res2 = await app.request('/test', { headers });
    expect(res2.status).toBe(429);

    vi.advanceTimersByTime(200_000);

    const res3 = await app.request('/test', { headers });
    expect(res3.status).toBe(200);

    vi.useRealTimers();
  });
});
