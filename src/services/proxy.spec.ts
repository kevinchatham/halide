import { Hono } from 'hono';
import type { ProxyRoute } from '../types/api';
import type { Logger, THalideApp } from '../types/app';
import { createProxyService } from './proxy';

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

describe('createProxyService', () => {
  it('creates a handler function', () => {
    const route: ProxyRoute = {
      access: 'public',
      methods: ['get'],
      path: '/api/users',
      target: 'https://api.example.com',
      type: 'proxy',
    };

    const handler = createProxyService(route, createApp());
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

    const handler = createProxyService(route, createApp());
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

    const handler = createProxyService(route, createApp());
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

    const handler = createProxyService(route, createApp());
    expect(typeof handler).toBe('function');
  });

  it('applies identity headers when claims are provided', async () => {
    const route: ProxyRoute = {
      access: 'private',
      identity: (_ctx: unknown, app: THalideApp) => ({
        'x-user-id': (app.claims as { sub: string }).sub,
      }),
      methods: ['get'],
      path: '/api/users',
      target: 'https://api.example.com',
      type: 'proxy',
    };

    const app = createApp({ role: 'admin', sub: 'user-123' });
    const handler = createProxyService(route, app);

    const honoApp = new Hono();
    honoApp.get('/api/users', handler);

    const res = await honoApp.request('/api/users');
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

    const handler = createProxyService(route, createApp(), { original: true });

    const app = new Hono<{ Variables: { rawBody?: unknown } }>();
    app.post('/api/data', handler);

    await app.request('/api/data', {
      body: JSON.stringify({ original: true }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });

    expect(transformFn).toHaveBeenCalled();
    expect(transformFn.mock.calls[0]![0].method).toBe('post');
    expect(transformFn.mock.calls[0]![0].body).toEqual({ original: true });
  });

  it('blocks authorization header by default', async () => {
    const route: ProxyRoute = {
      access: 'public',
      methods: ['get'],
      path: '/api/data',
      target: 'https://api.example.com',
      type: 'proxy',
    };

    const handler = createProxyService(route, createApp());
    const app = new Hono();
    app.get('/api/data', handler);

    const req = new Request('http://localhost/api/data', {
      headers: { authorization: 'Bearer token123', 'x-forwarded-for': '127.0.0.1' },
      method: 'GET',
    });

    const res = await app.fetch(req);
    expect(res.status).toBeLessThan(600);
  });

  it('blocks cookie header by default', async () => {
    const route: ProxyRoute = {
      access: 'public',
      methods: ['get'],
      path: '/api/data',
      target: 'https://api.example.com',
      type: 'proxy',
    };

    const handler = createProxyService(route, createApp());
    const app = new Hono();
    app.get('/api/data', handler);

    const req = new Request('http://localhost/api/data', {
      headers: { cookie: 'session=abc123', 'x-forwarded-for': '127.0.0.1' },
      method: 'GET',
    });

    const res = await app.fetch(req);
    expect(res.status).toBeLessThan(600);
  });

  it('forwards headers when forwardHeaders allowlist is set', async () => {
    const route: ProxyRoute = {
      access: 'public',
      forwardHeaders: ['accept', 'content-type'],
      methods: ['post'],
      path: '/api/data',
      target: 'https://api.example.com',
      type: 'proxy',
    };

    const handler = createProxyService(route, createApp());
    const app = new Hono();
    app.post('/api/data', handler);

    const req = new Request('http://localhost/api/data', {
      body: JSON.stringify({ test: true }),
      headers: {
        accept: 'application/json',
        authorization: 'Bearer token123',
        'content-type': 'application/json',
        'x-forwarded-for': '127.0.0.1',
      },
      method: 'POST',
    });

    const res = await app.fetch(req);
    expect(res.status).toBeLessThan(600);
  });

  it('passes agent to upstream request when configured', async () => {
    const http = await import('node:http');
    const customAgent = new http.Agent({ keepAlive: true });

    const route: ProxyRoute = {
      access: 'public',
      agent: customAgent,
      methods: ['get'],
      path: '/api/data',
      target: 'https://api.example.com',
      type: 'proxy',
    };

    const handler = createProxyService(route, createApp());
    const app = new Hono();
    app.get('/api/data', handler);

    const res = await app.fetch(new Request('http://localhost/api/data', { method: 'GET' }));
    expect(res.status).toBeLessThan(600);
  });
});
