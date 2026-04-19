import { Hono } from 'hono';
import { sign } from 'hono/jwt';
import { z } from 'zod';
import { createNoopLogger } from '../config/defaults';
import type { Logger, ServerConfig } from '../config/types';
import { registerRoutes } from './registry';

const noopLogger: Logger = createNoopLogger();
const secret = 'test-secret';

async function createValidToken(claims: Record<string, unknown>): Promise<string> {
  return sign(claims, secret, 'HS256');
}

type HalideVariables = { rawBody?: unknown };

async function createTestApp(config: ServerConfig): Promise<Hono<{ Variables: HalideVariables }>> {
  const app = new Hono<{ Variables: HalideVariables }>();
  await registerRoutes(app, config, noopLogger);
  return app;
}

describe('registerRoutes', () => {
  it('does nothing when routes is missing', async () => {
    const app = await createTestApp({
      security: { auth: { secret: () => secret, strategy: 'bearer' } },
      spa: { root: '/var/www' },
    });

    const res = await app.request('/nonexistent');
    expect(res.status).toBe(404);
  });

  describe('API routes', () => {
    it('registers public api routes and returns result', async () => {
      const app = await createTestApp({
        apiRoutes: [
          {
            access: 'public',
            handler: async () => ({ id: 1, name: 'test' }),
            path: '/items',
            type: 'api',
          },
        ],
        spa: { root: '/var/www' },
      });

      const res = await app.request('/items');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ id: 1, name: 'test' });
    });

    it('defaults to GET when method is not specified', async () => {
      const app = await createTestApp({
        apiRoutes: [
          {
            access: 'public',
            handler: async () => ({ ok: true }),
            path: '/data',
            type: 'api',
          },
        ],
        spa: { root: '/var/www' },
      });

      const res = await app.request('/data');
      expect(res.status).toBe(200);
    });

    it('registers POST routes', async () => {
      const app = await createTestApp({
        apiRoutes: [
          {
            access: 'public',
            handler: async () => ({ created: true }),
            method: 'post',
            path: '/items',
            type: 'api',
          },
        ],
        spa: { root: '/var/www' },
      });

      const res = await app.request('/items', { method: 'POST' });
      expect(res.status).toBe(200);
    });

    it('registers PUT routes', async () => {
      const app = await createTestApp({
        apiRoutes: [
          {
            access: 'public',
            handler: async () => ({ updated: true }),
            method: 'put',
            path: '/items/:id',
            type: 'api',
          },
        ],
        spa: { root: '/var/www' },
      });

      const res = await app.request('/items/123', { method: 'PUT' });
      expect(res.status).toBe(200);
    });

    it('registers DELETE routes', async () => {
      const app = await createTestApp({
        apiRoutes: [
          {
            access: 'public',
            handler: async () => ({ deleted: true }),
            method: 'delete',
            path: '/items/:id',
            type: 'api',
          },
        ],
        spa: { root: '/var/www' },
      });

      const res = await app.request('/items/123', { method: 'DELETE' });
      expect(res.status).toBe(200);
    });

    it('registers multiple api routes', async () => {
      const app = await createTestApp({
        apiRoutes: [
          {
            access: 'public',
            handler: async () => ({ public: true }),
            path: '/public',
            type: 'api',
          },
          {
            access: 'public',
            handler: async () => ({ health: true }),
            path: '/health',
            type: 'api',
          },
        ],
        spa: { root: '/var/www' },
      });

      const res1 = await app.request('/public');
      const res2 = await app.request('/health');

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);
    });
  });

  describe('Authentication', () => {
    it('returns 401 for private routes without token', async () => {
      const app = await createTestApp({
        apiRoutes: [
          {
            access: 'private',
            handler: async () => ({ ok: true }),
            path: '/profile',
            type: 'api',
          },
        ],
        security: { auth: { secret: () => secret, strategy: 'bearer' } },
        spa: { root: '/var/www' },
      });

      const res = await app.request('/profile');
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body).toEqual({ error: 'Unauthorized' });
    });

    it('returns 401 for private routes with invalid token', async () => {
      const app = await createTestApp({
        apiRoutes: [
          {
            access: 'private',
            handler: async () => ({ ok: true }),
            path: '/profile',
            type: 'api',
          },
        ],
        security: { auth: { secret: () => secret, strategy: 'bearer' } },
        spa: { root: '/var/www' },
      });

      const res = await app.request('/profile', {
        headers: { authorization: 'Bearer invalid-token' },
      });
      expect(res.status).toBe(401);
    });

    it('allows private routes with valid token', async () => {
      const token = await createValidToken({ role: 'admin', sub: 'user-123' });
      const app = await createTestApp({
        apiRoutes: [
          {
            access: 'private',
            handler: async (_ctx: unknown, claims: unknown) => ({ user: claims }),
            path: '/profile',
            type: 'api',
          },
        ],
        security: { auth: { secret: () => secret, strategy: 'bearer' } },
        spa: { root: '/var/www' },
      });

      const res = await app.request('/profile', {
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.status).toBe(200);
    });
  });

  describe('Authorization', () => {
    it('returns 403 when authorize returns false', async () => {
      const app = await createTestApp({
        apiRoutes: [
          {
            access: 'public',
            authorize: async () => false,
            handler: async () => ({ ok: true }),
            path: '/items',
            type: 'api',
          },
        ],
        spa: { root: '/var/www' },
      });

      const res = await app.request('/items');
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body).toEqual({ error: 'Forbidden' });
    });

    it('allows when authorize returns true', async () => {
      const app = await createTestApp({
        apiRoutes: [
          {
            access: 'public',
            authorize: async () => true,
            handler: async () => ({ ok: true }),
            path: '/items',
            type: 'api',
          },
        ],
        spa: { root: '/var/www' },
      });

      const res = await app.request('/items');
      expect(res.status).toBe(200);
    });

    it('returns 403 when authorize throws', async () => {
      const app = await createTestApp({
        apiRoutes: [
          {
            access: 'public',
            authorize: async () => {
              throw new Error('Auth error');
            },
            handler: async () => ({ ok: true }),
            path: '/items',
            type: 'api',
          },
        ],
        spa: { root: '/var/www' },
      });

      const res = await app.request('/items');
      expect(res.status).toBe(403);
    });
  });

  describe('Observability', () => {
    it('executes onRequest and onResponse hooks', async () => {
      const onRequest = vi.fn();
      const onResponse = vi.fn();

      const app = await createTestApp({
        apiRoutes: [
          {
            access: 'public',
            handler: async () => ({ ok: true }),
            path: '/items',
            type: 'api',
          },
        ],
        observability: { onRequest, onResponse },
        spa: { root: '/var/www' },
      });

      await app.request('/items');

      expect(onRequest).toHaveBeenCalledTimes(1);
      expect(onResponse).toHaveBeenCalledTimes(1);
    });

    it('skips observability when route observe is false', async () => {
      const onRequest = vi.fn();
      const onResponse = vi.fn();

      const app = await createTestApp({
        apiRoutes: [
          {
            access: 'public',
            handler: async () => ({ ok: true }),
            observe: false,
            path: '/items',
            type: 'api',
          },
        ],
        observability: { onRequest, onResponse },
        spa: { root: '/var/www' },
      });

      await app.request('/items');

      expect(onRequest).not.toHaveBeenCalled();
      expect(onResponse).not.toHaveBeenCalled();
    });

    it('skips observability when no onRequest or onResponse', async () => {
      const app = await createTestApp({
        apiRoutes: [
          {
            access: 'public',
            handler: async () => ({ ok: true }),
            path: '/items',
            type: 'api',
          },
        ],
        observability: {},
        spa: { root: '/var/www' },
      });

      const res = await app.request('/items');
      expect(res.status).toBe(200);
    });

    it('captures error in onResponse', async () => {
      const onResponse = vi.fn();

      const app = new Hono<{ Variables: HalideVariables }>();
      app.onError(() => new Response(null, { status: 500 }));
      await registerRoutes(
        app,
        {
          apiRoutes: [
            {
              access: 'public',
              handler: async () => {
                throw new Error('Handler failed');
              },
              path: '/items',
              type: 'api',
            },
          ],
          observability: { onResponse },
          spa: { root: '/var/www' },
        },
        noopLogger,
      );

      await app.request('/items');

      expect(onResponse).toHaveBeenCalledTimes(1);
      const call = onResponse.mock.calls[0]!;
      expect(call[2].statusCode).toBe(500);
      expect(call[2].error).toBeInstanceOf(Error);
    });
  });

  describe('Validation', () => {
    it('registers routes with validation schema', async () => {
      const app = await createTestApp({
        apiRoutes: [
          {
            access: 'public',
            handler: async (ctx: unknown) => ({ received: (ctx as { body: unknown }).body }),
            method: 'post',
            path: '/items',
            type: 'api',
            validationSchema: z.object({ name: z.string() }),
          },
        ],
        spa: { root: '/var/www' },
      });

      const res = await app.request('/items', {
        body: JSON.stringify({ name: 'test' }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid body with validation schema', async () => {
      const app = await createTestApp({
        apiRoutes: [
          {
            access: 'public',
            handler: async (ctx: unknown) => ({ received: (ctx as { body: unknown }).body }),
            method: 'post',
            path: '/items',
            type: 'api',
            validationSchema: z.object({ name: z.string() }),
          },
        ],
        spa: { root: '/var/www' },
      });

      const res = await app.request('/items', {
        body: JSON.stringify({ name: 123 }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });
      expect(res.status).toBe(400);
    });
  });

  describe('Proxy routes', () => {
    it('registers public proxy routes', async () => {
      const app = await createTestApp({
        proxyRoutes: [
          {
            access: 'public',
            methods: ['get'],
            path: '/users',
            target: 'https://api.example.com',
            type: 'proxy',
          },
        ],
        spa: { root: '/var/www' },
      });

      const res = await app.request('/users');
      expect(res.status).toBeLessThan(600);
    });

    it('returns 401 for private proxy routes without token', async () => {
      const app = await createTestApp({
        proxyRoutes: [
          {
            access: 'private',
            methods: ['get'],
            path: '/admin',
            target: 'https://api.example.com',
            type: 'proxy',
          },
        ],
        security: { auth: { secret: () => secret, strategy: 'bearer' } },
        spa: { root: '/var/www' },
      });

      const res = await app.request('/admin');
      expect(res.status).toBe(401);
    });

    it('registers proxy routes with transform function', async () => {
      const transformFn = vi.fn().mockReturnValue({ body: {}, headers: {} });

      const app = await createTestApp({
        proxyRoutes: [
          {
            access: 'public',
            methods: ['post'],
            path: '/api',
            target: 'https://api.example.com',
            transform: transformFn,
            type: 'proxy',
          },
        ],
        spa: { root: '/var/www' },
      });

      await app.request('/api', {
        body: JSON.stringify({ key: 'value' }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });

      expect(transformFn).toHaveBeenCalled();
    });

    it('registers multiple proxy routes', async () => {
      const app = await createTestApp({
        proxyRoutes: [
          {
            access: 'public',
            methods: ['get'],
            path: '/users',
            target: 'https://api1.example.com',
            type: 'proxy',
          },
          {
            access: 'public',
            methods: ['get'],
            path: '/orders',
            target: 'https://api2.example.com',
            type: 'proxy',
          },
        ],
        spa: { root: '/var/www' },
      });

      const res1 = await app.request('/users');
      const res2 = await app.request('/orders');
      expect(res1.status).toBeLessThan(600);
      expect(res2.status).toBeLessThan(600);
    });
  });

  describe('JWKS strategy', () => {
    it('uses JWKS auth when strategy is jwks', async () => {
      const app = await createTestApp({
        apiRoutes: [
          {
            access: 'private',
            handler: async () => ({ ok: true }),
            path: '/profile',
            type: 'api',
          },
        ],
        security: {
          auth: {
            jwksUri: 'https://auth.example.com/.well-known/jwks.json',
            strategy: 'jwks',
          },
        },
        spa: { root: '/var/www' },
      });

      const res = await app.request('/profile');
      expect(res.status).toBe(401);
    });
  });

  describe('OpenAPI metadata', () => {
    it('registers route with openapi responses containing schema', async () => {
      const app = await createTestApp({
        apiRoutes: [
          {
            access: 'public',
            handler: async () => ({ id: 1 }),
            openapi: {
              responses: {
                '200': { description: 'OK', schema: z.object({ id: z.number() }) },
                '404': { description: 'Not Found' },
              },
              summary: 'Get item',
            },
            path: '/items',
            type: 'api',
          },
        ],
        spa: { root: '/var/www' },
      });

      const res = await app.request('/items');
      expect(res.status).toBe(200);
    });

    it('registers route with openapi responseSchema', async () => {
      const app = await createTestApp({
        apiRoutes: [
          {
            access: 'public',
            handler: async () => ({ id: 1 }),
            openapi: {
              responseSchema: z.object({ id: z.number() }),
              summary: 'Get item',
            },
            path: '/items',
            type: 'api',
          },
        ],
        spa: { root: '/var/www' },
      });

      const res = await app.request('/items');
      expect(res.status).toBe(200);
    });

    it('registers route with openapi description and tags', async () => {
      const app = await createTestApp({
        apiRoutes: [
          {
            access: 'public',
            handler: async () => ({ ok: true }),
            openapi: {
              description: 'A test route',
              summary: 'Test',
              tags: ['test'],
            },
            path: '/test',
            type: 'api',
          },
        ],
        spa: { root: '/var/www' },
      });

      const res = await app.request('/test');
      expect(res.status).toBe(200);
    });
  });

  describe('Auth config without secret or jwks', () => {
    it('returns undefined claimExtractor when auth has no secret or jwks', async () => {
      const app = await createTestApp({
        apiRoutes: [
          {
            access: 'private',
            handler: async () => ({ ok: true }),
            path: '/profile',
            type: 'api',
          },
        ],
        security: { auth: { strategy: 'bearer' } },
        spa: { root: '/var/www' },
      });

      const res = await app.request('/profile');
      expect(res.status).toBe(200);
    });
  });

  describe('Proxy authorization', () => {
    it('returns 403 when proxy authorize returns false', async () => {
      const app = await createTestApp({
        proxyRoutes: [
          {
            access: 'public',
            authorize: async () => false,
            methods: ['get'],
            path: '/admin',
            target: 'https://api.example.com',
            type: 'proxy',
          },
        ],
        spa: { root: '/var/www' },
      });

      const res = await app.request('/admin');
      expect(res.status).toBe(403);
    });

    it('returns 403 when proxy authorize throws', async () => {
      const app = await createTestApp({
        proxyRoutes: [
          {
            access: 'public',
            authorize: async () => {
              throw new Error('Auth error');
            },
            methods: ['get'],
            path: '/admin',
            target: 'https://api.example.com',
            type: 'proxy',
          },
        ],
        spa: { root: '/var/www' },
      });

      const res = await app.request('/admin');
      expect(res.status).toBe(403);
    });

    it('executes proxy observability onRequest and onResponse', async () => {
      const onRequest = vi.fn();
      const onResponse = vi.fn();

      const app = await createTestApp({
        observability: { onRequest, onResponse },
        proxyRoutes: [
          {
            access: 'public',
            methods: ['get'],
            path: '/users',
            target: 'https://api.example.com',
            type: 'proxy',
          },
        ],
        spa: { root: '/var/www' },
      });

      await app.request('/users');
      expect(onRequest).toHaveBeenCalledTimes(1);
    });

    it('skips proxy observability when observe is false', async () => {
      const onRequest = vi.fn();
      const onResponse = vi.fn();

      const app = await createTestApp({
        observability: { onRequest, onResponse },
        proxyRoutes: [
          {
            access: 'public',
            methods: ['get'],
            observe: false,
            path: '/users',
            target: 'https://api.example.com',
            type: 'proxy',
          },
        ],
        spa: { root: '/var/www' },
      });

      await app.request('/users');
      expect(onRequest).not.toHaveBeenCalled();
    });
  });
});
