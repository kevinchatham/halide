import { Hono } from 'hono';
import type { Logger, ProxyRoute } from '../types';
import { buildRequestContextFromHono, createProxyService, serializeQueryParam } from './proxy';

const noopLogger: Logger = {
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
};

describe('serializeQueryParam', () => {
  it('serializes string values', () => {
    expect(serializeQueryParam('hello')).toBe('hello');
  });

  it('serializes non-string values as JSON', () => {
    expect(serializeQueryParam(42)).toBe('42');
    expect(serializeQueryParam(true)).toBe('true');
  });

  it('serializes array values', () => {
    expect(serializeQueryParam(['a', 'b'])).toEqual(['a', 'b']);
  });

  it('serializes arrays with non-string items as JSON', () => {
    expect(serializeQueryParam([1, 'b'])).toEqual(['1', 'b']);
  });
});

describe('buildRequestContextFromHono', () => {
  it('builds context from Hono request', async () => {
    const app = new Hono();
    let result: ReturnType<typeof buildRequestContextFromHono> | undefined;
    app.get('/users/:id', (c) => {
      result = buildRequestContextFromHono(c, { name: 'test' });
      return c.json({});
    });

    await app.request('/users/123?active=true', {
      headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
    });

    expect(result).toBeDefined();
    expect(result!.method).toBe('get');
    expect(result!.path).toBe('/users/123');
    expect(result!.params).toEqual({ id: '123' });
    expect(result!.query).toEqual({ active: 'true' });
    expect(result!.body).toEqual({ name: 'test' });
  });

  it('handles requests without query params', async () => {
    const app = new Hono();
    let result: ReturnType<typeof buildRequestContextFromHono> | undefined;
    app.get('/test', (c) => {
      result = buildRequestContextFromHono(c);
      return c.json({});
    });

    await app.request('/test');

    expect(result).toBeDefined();
    expect(result!.query).toEqual({});
    expect(result!.body).toBeUndefined();
  });
});

describe('createProxyService', () => {
  it('creates a handler function', () => {
    const route: ProxyRoute = {
      access: 'public',
      methods: ['get'],
      path: '/api/users',
      target: 'https://api.example.com',
      type: 'proxy',
    };

    const handler = createProxyService(route, undefined, noopLogger);
    expect(typeof handler).toBe('function');
  });

  it('uses default timeout when not specified', () => {
    const route: ProxyRoute = {
      access: 'public',
      methods: ['get'],
      path: '/api/users',
      target: 'https://api.example.com',
      type: 'proxy',
    };

    const handler = createProxyService(route, undefined, noopLogger);
    expect(typeof handler).toBe('function');
  });

  it('uses custom timeout when specified', () => {
    const route: ProxyRoute = {
      access: 'public',
      methods: ['get'],
      path: '/api/users',
      target: 'https://api.example.com',
      timeout: 5000,
      type: 'proxy',
    };

    const handler = createProxyService(route, undefined, noopLogger);
    expect(typeof handler).toBe('function');
  });

  it('uses proxyPath for path rewriting', () => {
    const route: ProxyRoute = {
      access: 'public',
      methods: ['get'],
      path: '/api/users',
      proxyPath: '/users',
      target: 'https://api.example.com',
      type: 'proxy',
    };

    const handler = createProxyService(route, undefined, noopLogger);
    expect(typeof handler).toBe('function');
  });

  it('applies identity headers when claims are provided', async () => {
    const route: ProxyRoute = {
      access: 'private',
      identity: (_ctx: unknown, claims: unknown) => ({
        'x-user-id': (claims as { sub: string }).sub,
      }),
      methods: ['get'],
      path: '/api/users',
      target: 'https://api.example.com',
      type: 'proxy',
    };

    const claims = { role: 'admin', sub: 'user-123' };
    const handler = createProxyService(route, claims, noopLogger);

    const app = new Hono();
    app.get('/api/users', handler);

    const res = await app.request('/api/users');
    expect(res.status).toBeLessThan(600);
  });

  it('applies transform function when provided', async () => {
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

    const app = new Hono<{ Variables: { rawBody?: unknown } }>();
    app.post('/api/data', handler);

    await app.request('/api/data', {
      body: JSON.stringify({ original: true }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });

    expect(transformFn).toHaveBeenCalled();
    expect(transformFn.mock.calls[0]![0].body).toEqual({ original: true });
  });

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
});
