import { Hono } from 'hono';
import type { ProxyRoute } from '../types/api';
import type { Logger, THalideApp } from '../types/app';
import { createAgentCache, createProxyService } from './proxy';

const noopLogger: Logger<unknown> = {
  debug: (_scope: unknown) => {},
  error: (_scope: unknown) => {},
  info: (_scope: unknown) => {},
  warn: (_scope: unknown) => {},
};

const createApp = (claims?: unknown): THalideApp => ({
  claims,
  logger: noopLogger,
});

describe('createProxyService — errors', () => {
  const agentCache = createAgentCache();
  it('handles proxy errors gracefully', async () => {
    const route: ProxyRoute = {
      access: 'public',
      methods: ['get'],
      path: '/api/fail',
      target: 'https://nonexistent.invalid.host',
      timeout: 100,
      type: 'proxy',
    };

    const handler = createProxyService(route, createApp(), agentCache);

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

    const errorLogger: Logger<unknown> = {
      debug: (_scope: unknown) => {},
      error: vi.fn(),
      info: (_scope: unknown) => {},
      warn: (_scope: unknown) => {},
    };

    const appWithErrorLogger: THalideApp = { claims: undefined, logger: errorLogger };
    const handler = createProxyService(route, appWithErrorLogger, agentCache, { original: true });

    const app = new Hono();
    app.post('/api/data', handler);
    app.onError(() => new Response(null, { status: 502 }));

    const res = await app.request('/api/data', {
      body: JSON.stringify({ original: true }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });

    expect(res.status).toBe(502);
    expect(errorLogger.error).toHaveBeenCalledWith({}, expect.any(String));
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

    const handler = createProxyService(route, createApp(), agentCache, { original: true });

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

    const handler = createProxyService(route, createApp(), agentCache, { original: true });

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

    const handler = createProxyService(route, createApp(), agentCache, { original: true });

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

    const handler = createProxyService(route, createApp(), agentCache);

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

    const handler = createProxyService(route, createApp(), agentCache);

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

    const handler = createProxyService(route, createApp(), agentCache);

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

    const handler = createProxyService(route, createApp(), agentCache);

    const app = new Hono();
    app.get('/api/users', handler);
    app.onError(() => new Response(null, { status: 502 }));

    const res = await app.request('/api/users', {
      headers: { host: 'original.example.com' },
    });
    expect(res.status).toBeLessThan(600);
  });
});
