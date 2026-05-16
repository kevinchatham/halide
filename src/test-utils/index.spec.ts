import { createTestApp, disposeRateLimit, noopLogger } from '.';

describe('createTestApp', () => {
  it('applies no middleware when options are omitted', async () => {
    const app = createTestApp({
      apiRoutes: [
        { access: 'public', handler: async () => ({ ok: true }), path: '/test', type: 'api' },
      ],
    });
    const res = await app.request('/test');
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
    expect(res.headers.get('content-security-policy')).toBeNull();
    expect(res.headers.get('x-request-id')).toBeNull();
  });

  it('applies CORS middleware when cors: true', async () => {
    const app = createTestApp(
      {
        apiRoutes: [
          { access: 'public', handler: async () => ({ ok: true }), path: '/test', type: 'api' },
        ],
      },
      { cors: true },
    );
    const res = await app.request('/other', {
      headers: { origin: 'http://localhost:3000' },
      method: 'OPTIONS',
    });
    const allowMethods = res.headers.get('access-control-allow-methods') ?? '';
    expect(allowMethods).toContain('GET');
    expect(allowMethods).toContain('POST');
    expect(allowMethods).toContain('DELETE');
  });

  it('applies CORS with custom origin', async () => {
    const app = createTestApp(
      {
        apiRoutes: [
          { access: 'public', handler: async () => ({ ok: true }), path: '/test', type: 'api' },
        ],
        security: { cors: { origin: ['http://localhost:3000'] } },
      },
      { cors: true },
    );
    const res = await app.request('/test', {
      headers: { origin: 'http://localhost:3000' },
    });
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:3000');
  });

  it('applies CSP security headers when csp: true', async () => {
    const app = createTestApp(
      {
        apiRoutes: [
          { access: 'public', handler: async () => ({ ok: true }), path: '/test', type: 'api' },
        ],
      },
      { csp: true },
    );
    const res = await app.request('/test');
    expect(res.headers.get('content-security-policy')).toContain("'self'");
  });

  it('applies custom CSP directives', async () => {
    const app = createTestApp(
      {
        apiRoutes: [
          { access: 'public', handler: async () => ({ ok: true }), path: '/test', type: 'api' },
        ],
        security: { csp: { defaultSrc: ["'none'"], scriptSrc: ["'none'"] } },
      },
      { csp: true },
    );
    const res = await app.request('/test');
    expect(res.headers.get('content-security-policy')).toContain("'none'");
  });

  it('applies rate limiting when rateLimit: true', async () => {
    const app = createTestApp(
      {
        apiRoutes: [
          { access: 'public', handler: async () => ({ ok: true }), path: '/test', type: 'api' },
        ],
        security: { rateLimit: { maxRequests: 2, windowMs: 60_000 } },
      },
      { rateLimit: true },
    );
    expect((await app.request('/test')).status).toBe(200);
    expect((await app.request('/test')).status).toBe(200);
    expect((await app.request('/test')).status).toBe(429);
  });

  it('does not apply rate limiting when not configured', async () => {
    const app = createTestApp({
      apiRoutes: [
        { access: 'public', handler: async () => ({ ok: true }), path: '/test', type: 'api' },
      ],
    });
    for (let i = 0; i < 110; i++) {
      const res = await app.request('/test');
      expect(res.status).not.toBe(429);
    }
  });

  it('disposeRateLimit returns true and cleans up when rate limit was enabled', () => {
    const app = createTestApp(
      {
        security: { rateLimit: { maxRequests: 100, windowMs: 60_000 } },
      },
      { rateLimit: true },
    );
    expect(disposeRateLimit(app)).toBe(true);
  });

  it('disposeRateLimit returns false when rate limit was not enabled', () => {
    const app = createTestApp({});
    expect(disposeRateLimit(app)).toBe(false);
  });

  it('disposeRateLimit returns false on second call (cleanup verified)', () => {
    const app = createTestApp(
      {
        security: { rateLimit: { maxRequests: 100, windowMs: 60_000 } },
      },
      { rateLimit: true },
    );
    expect(disposeRateLimit(app)).toBe(true);
    expect(disposeRateLimit(app)).toBe(false);
  });

  it('applies request ID middleware when requestId: true and config enables it', async () => {
    const app = createTestApp({ observability: { requestId: true } }, { requestId: true });
    const res = await app.request('/nonexistent');
    const requestId = res.headers.get('x-request-id');
    expect(requestId).not.toBeNull();
  });

  it('does not apply request ID middleware when requestId: true but config does not enable it', async () => {
    const app = createTestApp({}, { requestId: true });
    const res = await app.request('/nonexistent');
    expect(res.headers.get('x-request-id')).toBeNull();
  });

  it('respects x-request-id from incoming request', async () => {
    const app = createTestApp({ observability: { requestId: true } }, { requestId: true });
    const res = await app.request('/nonexistent', {
      headers: { 'x-request-id': 'my-custom-id' },
    });
    expect(res.headers.get('x-request-id')).toBe('my-custom-id');
  });

  it('returns 500 JSON for unhandled errors via error handler', async () => {
    const app = createTestApp(
      {
        apiRoutes: [
          {
            access: 'public',
            handler: async () => {
              throw new Error('boom');
            },
            path: '/fail',
            type: 'api',
          },
        ],
      },
      { errorHandler: true },
    );
    const res = await app.request('/fail');
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: 'Internal Server Error' });
  });

  it('uses custom logger when provided with errorHandler', async () => {
    const errorFn = vi.fn();
    const logger = {
      debug: vi.fn(),
      error: errorFn,
      info: vi.fn(),
      warn: vi.fn(),
    };
    const app = createTestApp(
      {
        apiRoutes: [
          {
            access: 'public',
            handler: async () => {
              throw new Error('boom');
            },
            path: '/fail',
            type: 'api',
          },
        ],
      },
      { errorHandler: true, logger },
    );
    await app.request('/fail');
    expect(errorFn).toHaveBeenCalled();
  });

  it('applies app handler when appHandler: true and app.root is set', async () => {
    const app = createTestApp({ app: { root: '/tmp/nonexistent-test-dir' } }, { appHandler: true });
    const res = await app.request('/');
    expect(res.status).toBe(404);
  });

  it('applies multiple middleware flags together', async () => {
    const app = createTestApp(
      {
        apiRoutes: [
          { access: 'public', handler: async () => ({ ok: true }), path: '/test', type: 'api' },
        ],
        security: {
          cors: { origin: ['http://localhost:3000'] },
          csp: { defaultSrc: ["'none'"] },
        },
      },
      { cors: true, csp: true },
    );
    const res = await app.request('/test', {
      headers: { origin: 'http://localhost:3000' },
    });
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:3000');
    expect(res.headers.get('content-security-policy')).toContain("'none'");
  });

  it('noopLogger is exported and is a valid logger', () => {
    expect(noopLogger).toBeDefined();
    expect(typeof noopLogger.debug).toBe('function');
    expect(typeof noopLogger.error).toBe('function');
    expect(typeof noopLogger.info).toBe('function');
    expect(typeof noopLogger.warn).toBe('function');
  });
});
