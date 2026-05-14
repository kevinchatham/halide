import { z } from 'zod';
import { createTestApp } from '../test-utils/index.js';
import type { ProxyRoute } from '../types/api';
import { resolveOpenApiSpec } from './registry.openapi';

vi.mock('../services/proxy', () => ({
  buildRequestContextFromHono: vi
    .fn()
    .mockReturnValue({ body: undefined, method: 'get', params: {}, path: '', query: {} }),
  createAgentCache: () => ({
    dispose: () => {},
    getAgent: () => null as unknown as import('node:http').Agent,
  }),
  createProxyService: vi.fn().mockReturnValue(async () => new Response('ok', { status: 200 })),
}));

describe('registerRoutes', () => {
  it('does nothing when routes is missing', async () => {
    const app = createTestApp({
      app: { root: '/var/www' },
      security: { auth: { secret: () => 'test-secret', strategy: 'bearer' } },
    });

    const res = await app.request('/nonexistent');
    expect(res.status).toBe(404);
  });

  describe('Proxy routes', () => {
    it('forwards proxy requests with observe disabled', async () => {
      const { createProxyService } = await import('../services/proxy');
      (createProxyService as ReturnType<typeof vi.fn>).mockReturnValueOnce(
        async () => new Response('ok', { status: 200 }),
      );

      const app = createTestApp({
        app: { root: '/var/www' },
        proxyRoutes: [
          {
            access: 'public',
            methods: ['get'],
            observe: false,
            path: '/proxy',
            target: 'https://api.example.com',
            type: 'proxy',
          },
        ],
      });

      const res = await app.request('/proxy');
      expect(res.status).toBe(200);
    });

    it('forwards proxy requests and collects response body', async () => {
      const { createProxyService } = await import('../services/proxy');
      (createProxyService as ReturnType<typeof vi.fn>).mockReturnValueOnce(
        async () =>
          new Response(null, {
            headers: { 'Content-Type': 'text/plain' },
            status: 200,
          }),
      );

      const app = createTestApp({
        app: { root: '/var/www' },
        proxyRoutes: [
          {
            access: 'public',
            methods: ['get'],
            observe: true,
            path: '/proxy',
            target: 'https://api.example.com',
            type: 'proxy',
          },
        ],
      });

      const res = await app.request('/proxy');
      expect(res.status).toBe(200);
    });

    it('returns response directly when body is empty', async () => {
      const { createProxyService } = await import('../services/proxy');
      (createProxyService as ReturnType<typeof vi.fn>).mockReturnValueOnce(
        async () => new Response(null, { status: 204 }),
      );

      const app = createTestApp({
        app: { root: '/var/www' },
        proxyRoutes: [
          {
            access: 'public',
            methods: ['get'],
            observe: true,
            path: '/proxy',
            target: 'https://api.example.com',
            type: 'proxy',
          },
        ],
      });

      const res = await app.request('/proxy');
      expect(res.status).toBe(204);
    });

    it('uses configurable maxCollect from observability', async () => {
      const { createProxyService } = await import('../services/proxy');
      (createProxyService as ReturnType<typeof vi.fn>).mockReturnValueOnce(
        async () =>
          new Response(null, {
            headers: { 'Content-Type': 'text/plain' },
            status: 200,
          }),
      );

      const app = createTestApp({
        app: { root: '/var/www' },
        observability: { maxCollect: 512 },
        proxyRoutes: [
          {
            access: 'public',
            methods: ['get'],
            observe: true,
            path: '/proxy',
            target: 'https://api.example.com',
            type: 'proxy',
          },
        ],
      });

      const res = await app.request('/proxy');
      expect(res.status).toBe(200);
    });
  });

  describe('API routes', () => {
    it('registers public api routes and returns result', async () => {
      const app = createTestApp({
        apiRoutes: [
          {
            access: 'public',
            handler: async () => ({ id: 1, name: 'test' }),
            path: '/items',
            type: 'api',
          },
        ],
        app: { root: '/var/www' },
      });

      const res = await app.request('/items');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ id: 1, name: 'test' });
    });

    it('defaults to GET when method is not specified', async () => {
      const app = createTestApp({
        apiRoutes: [
          {
            access: 'public',
            handler: async () => ({ ok: true }),
            path: '/data',
            type: 'api',
          },
        ],
        app: { root: '/var/www' },
      });

      const res = await app.request('/data');
      expect(res.status).toBe(200);
    });

    it('registers POST routes', async () => {
      const app = createTestApp({
        apiRoutes: [
          {
            access: 'public',
            handler: async () => ({ created: true }),
            method: 'post',
            path: '/items',
            type: 'api',
          },
        ],
        app: { root: '/var/www' },
      });

      const res = await app.request('/items', { method: 'POST' });
      expect(res.status).toBe(200);
    });

    it('registers PUT routes', async () => {
      const app = createTestApp({
        apiRoutes: [
          {
            access: 'public',
            handler: async () => ({ updated: true }),
            method: 'put',
            path: '/items/:id',
            type: 'api',
          },
        ],
        app: { root: '/var/www' },
      });

      const res = await app.request('/items/123', { method: 'PUT' });
      expect(res.status).toBe(200);
    });

    it('registers DELETE routes', async () => {
      const app = createTestApp({
        apiRoutes: [
          {
            access: 'public',
            handler: async () => ({ deleted: true }),
            method: 'delete',
            path: '/items/:id',
            type: 'api',
          },
        ],
        app: { root: '/var/www' },
      });

      const res = await app.request('/items/123', { method: 'DELETE' });
      expect(res.status).toBe(200);
    });

    it('registers multiple api routes', async () => {
      const app = createTestApp({
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
        app: { root: '/var/www' },
      });

      const res1 = await app.request('/public');
      const res2 = await app.request('/health');

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);
    });
  });

  describe('Validation', () => {
    it('registers routes with request schema', async () => {
      const app = createTestApp({
        apiRoutes: [
          {
            access: 'public',
            handler: async (ctx: unknown) => ({ received: (ctx as { body: unknown }).body }),
            method: 'post',
            path: '/items',
            requestSchema: z.object({ name: z.string() }),
            type: 'api',
          },
        ],
        app: { root: '/var/www' },
      });

      const res = await app.request('/items', {
        body: JSON.stringify({ name: 'test' }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid body with request schema', async () => {
      const app = createTestApp({
        apiRoutes: [
          {
            access: 'public',
            handler: async (ctx: unknown) => ({ received: (ctx as { body: unknown }).body }),
            method: 'post',
            path: '/items',
            requestSchema: z.object({ name: z.string() }),
            type: 'api',
          },
        ],
        app: { root: '/var/www' },
      });

      const res = await app.request('/items', {
        body: JSON.stringify({ name: 123 }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });
      expect(res.status).toBe(400);
    });
  });
});

describe('resolveOpenApiSpec', () => {
  it('returns empty array when no proxy routes have openapiSpec', async () => {
    const routes: ProxyRoute<unknown>[] = [
      {
        access: 'public',
        methods: ['get'],
        path: '/api/users',
        target: 'https://api.example.com',
        type: 'proxy',
      },
    ];
    const result = await resolveOpenApiSpec(routes);
    expect(result).toEqual([]);
  });

  it('resolves external spec from file path', async () => {
    const routes: ProxyRoute<unknown>[] = [
      {
        access: 'public',
        methods: ['get'],
        openapiSpec: { path: 'test/fixtures/test-spec.json' },
        path: '/api/users',
        target: 'https://api.example.com',
        type: 'proxy',
      },
    ];
    const result = await resolveOpenApiSpec(routes);
    expect(result).toHaveLength(1);
    expect(result[0]?.spec).toHaveProperty('openapi');
  });

  it('resolves external spec from URL', async () => {
    const mockSpec = JSON.stringify({
      info: { title: 'Mock API', version: '1.0.0' },
      openapi: '3.1.0',
      paths: {},
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          json: () => Promise.resolve(JSON.parse(mockSpec)),
          ok: true,
        } as unknown as Response),
      ),
    );

    const routes: ProxyRoute<unknown>[] = [
      {
        access: 'public',
        methods: ['get'],
        openapiSpec: { path: 'https://api.example.com/openapi.json' },
        path: '/api/users',
        target: 'https://api.example.com',
        type: 'proxy',
      },
    ];
    const result = await resolveOpenApiSpec(routes);
    expect(result).toHaveLength(1);
    expect(result[0]?.spec).toHaveProperty('openapi');
    expect(result[0]?.spec).toHaveProperty('info');
    expect((result[0]?.spec as { info: { title: string } }).info.title).toBe('Mock API');
  });

  it('skips routes without openapiSpec', async () => {
    const routes: ProxyRoute<unknown>[] = [
      {
        access: 'public',
        methods: ['get'],
        openapiSpec: { path: 'test/fixtures/test-spec.json' },
        path: '/api/users',
        target: 'https://api.example.com',
        type: 'proxy',
      },
      {
        access: 'public',
        methods: ['get'],
        path: '/api/orders',
        target: 'https://api.example.com',
        type: 'proxy',
      },
    ];
    const result = await resolveOpenApiSpec(routes);
    expect(result).toHaveLength(1);
  });

  it('throws on invalid JSON file content', async () => {
    const routes: ProxyRoute<unknown>[] = [
      {
        access: 'public',
        methods: ['get'],
        openapiSpec: { path: './README.md' },
        path: '/api/users',
        target: 'https://api.example.com',
        type: 'proxy',
      },
    ];
    await expect(resolveOpenApiSpec(routes)).rejects.toThrow('not valid JSON');
  });

  it('throws on unreachable URL', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          statusText: 'Not Found',
        } as unknown as Response),
      ),
    );

    const routes: ProxyRoute<unknown>[] = [
      {
        access: 'public',
        methods: ['get'],
        openapiSpec: { path: 'https://example.invalid/nonexistent/openapi.json' },
        path: '/api/users',
        target: 'https://api.example.com',
        type: 'proxy',
      },
    ];
    await expect(resolveOpenApiSpec(routes)).rejects.toThrow('Failed to fetch OpenAPI spec');
  });

  it('treats file:// URLs as file paths', async () => {
    const routes: ProxyRoute<unknown>[] = [
      {
        access: 'public',
        methods: ['get'],
        openapiSpec: { path: 'file://../../test/fixtures/test-spec.json' },
        path: '/api/users',
        target: 'https://api.example.com',
        type: 'proxy',
      },
    ];
    await expect(resolveOpenApiSpec(routes)).rejects.toThrow('ENOENT');
  });
});
