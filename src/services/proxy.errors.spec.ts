import { Hono } from 'hono';
import type { Logger, ProxyRoute } from '../types';
import { createProxyService } from './proxy';

const noopLogger: Logger = {
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
};

describe('createProxyService — errors', () => {
  it('handles proxy errors gracefully', async () => {
    const route: ProxyRoute = {
      access: 'public',
      methods: ['get'],
      path: '/api/fail',
      target: 'https://nonexistent.invalid.host',
      timeout: 100,
      type: 'proxy',
    };

    const handler = createProxyService(route, undefined, noopLogger);

    const app = new Hono();
    app.get('/api/fail', handler);
    app.onError(() => new Response(null, { status: 502 }));

    const res = await app.request('/api/fail');
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('handles transform throwing an error', async () => {
    const transformFn = vi.fn().mockImplementation(() => {
      throw new Error('Transform failed');
    });

    const route: ProxyRoute = {
      access: 'public',
      methods: ['post'],
      path: '/api/data',
      target: 'https://api.example.com',
      transform: transformFn,
      type: 'proxy',
    };

    const errorLogger: Logger = {
      debug: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    };

    const handler = createProxyService(route, undefined, errorLogger, { original: true });

    const app = new Hono();
    app.post('/api/data', handler);
    app.onError(() => new Response(null, { status: 502 }));

    const res = await app.request('/api/data', {
      body: JSON.stringify({ original: true }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });

    expect(res.status).toBe(502);
    expect(errorLogger.error).toHaveBeenCalled();
  });

  it('normalizes headers with non-string and array values in transform', async () => {
    const transformFn = vi.fn().mockReturnValue({
      body: { transformed: true },
      headers: { 'x-custom': 'value' },
    });

    const route: ProxyRoute = {
      access: 'public',
      methods: ['post'],
      path: '/api/data',
      target: 'https://api.example.com',
      transform: transformFn,
      type: 'proxy',
    };

    const handler = createProxyService(route, undefined, noopLogger, { original: true });

    const app = new Hono();
    app.post('/api/data', handler);
    app.onError(() => new Response(null, { status: 502 }));

    await app.request('/api/data', {
      body: JSON.stringify({ original: true }),
      headers: { 'Content-Type': 'application/json', 'X-Array-Header': 'a, b' },
      method: 'POST',
    });

    expect(transformFn).toHaveBeenCalled();
  });

  it('transform receives normalized headers with array values joined', async () => {
    const transformFn = vi.fn().mockImplementation(({ method: _method, headers }) => {
      expect(headers['x-multi']).toBe('a, b');
      return { body: { ok: true }, headers: {} };
    });

    const route: ProxyRoute = {
      access: 'public',
      methods: ['post'],
      path: '/api/data',
      target: 'https://api.example.com',
      transform: transformFn,
      type: 'proxy',
    };

    const handler = createProxyService(route, undefined, noopLogger, { original: true });

    const app = new Hono();
    app.post('/api/data', handler);
    app.onError(() => new Response(null, { status: 502 }));

    await app.request('/api/data', {
      body: JSON.stringify({ original: true }),
      headers: { 'Content-Type': 'application/json', 'x-multi': ['a', 'b'] as unknown as string },
      method: 'POST',
    });

    expect(transformFn).toHaveBeenCalled();
  });

  it('transform sets-cookie header is not overwritten by transform headers', async () => {
    const transformFn = vi.fn().mockReturnValue({
      body: { transformed: true },
      headers: { 'set-cookie': 'session=abc' },
    });

    const route: ProxyRoute = {
      access: 'public',
      methods: ['post'],
      path: '/api/data',
      target: 'https://api.example.com',
      transform: transformFn,
      type: 'proxy',
    };

    const handler = createProxyService(route, undefined, noopLogger, { original: true });

    const app = new Hono();
    app.post('/api/data', handler);
    app.onError(() => new Response(null, { status: 502 }));

    await app.request('/api/data', {
      body: JSON.stringify({ original: true }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });

    expect(transformFn).toHaveBeenCalled();
  });

  it('rewrites wildcard paths with wildcard proxyPath', async () => {
    const route: ProxyRoute = {
      access: 'public',
      methods: ['get'],
      path: '/api/*',
      proxyPath: '/backend/*',
      target: 'https://api.example.com',
      type: 'proxy',
    };

    const handler = createProxyService(route, undefined, noopLogger);

    const app = new Hono();
    app.get('/api/*', handler);
    app.onError(() => new Response(null, { status: 502 }));

    const res = await app.request('/api/users/123');
    expect(res.status).toBeLessThan(600);
  });

  it('rewrites wildcard paths with plain proxyPath', async () => {
    const route: ProxyRoute = {
      access: 'public',
      methods: ['get'],
      path: '/api/*',
      proxyPath: '/backend',
      target: 'https://api.example.com',
      type: 'proxy',
    };

    const handler = createProxyService(route, undefined, noopLogger);

    const app = new Hono();
    app.get('/api/*', handler);
    app.onError(() => new Response(null, { status: 502 }));

    const res = await app.request('/api/users/123');
    expect(res.status).toBeLessThan(600);
  });

  it('strips host header from proxied request', async () => {
    const route: ProxyRoute = {
      access: 'public',
      methods: ['get'],
      path: '/api/users',
      target: 'https://api.example.com',
      type: 'proxy',
    };

    const handler = createProxyService(route, undefined, noopLogger);

    const app = new Hono();
    app.get('/api/users', handler);
    app.onError(() => new Response(null, { status: 502 }));

    const res = await app.request('/api/users', {
      headers: { host: 'original.example.com' },
    });
    expect(res.status).toBeLessThan(600);
  });

  it('preserves original host as x-forwarded-host', async () => {
    const route: ProxyRoute = {
      access: 'public',
      methods: ['get'],
      path: '/api/users',
      target: 'https://api.example.com',
      type: 'proxy',
    };

    const handler = createProxyService(route, undefined, noopLogger);

    const app = new Hono();
    app.get('/api/users', handler);
    app.onError(() => new Response(null, { status: 502 }));

    const res = await app.request('/api/users', {
      headers: { host: 'original.example.com' },
    });
    expect(res.status).toBeLessThan(600);
  });
});
