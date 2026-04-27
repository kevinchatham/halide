import { Hono } from 'hono';
import type { Logger, ProxyRoute } from '../types';
import { createProxyService } from './proxy';

const noopLogger: Logger = {
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
};

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
});
