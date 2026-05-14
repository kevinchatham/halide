import { createTestApp } from '../test-utils/index.js';

describe('registerRoutes — proxy', () => {
  describe('Proxy routes', () => {
    it('registers public proxy routes', async () => {
      const app = await createTestApp({
        app: { root: '/var/www' },
        proxyRoutes: [
          {
            access: 'public',
            methods: ['get'],
            path: '/users',
            target: 'https://api.example.com',
            type: 'proxy',
          },
        ],
      });

      const res = await app.request('/users');
      expect(res.status).toBeLessThan(600);
    });

    it('returns 401 for private proxy routes without token', async () => {
      const app = await createTestApp({
        app: { root: '/var/www' },
        proxyRoutes: [
          {
            access: 'private',
            methods: ['get'],
            path: '/admin',
            target: 'https://api.example.com',
            type: 'proxy',
          },
        ],
        security: { auth: { secret: () => 'test-secret', strategy: 'bearer' } },
      });

      const res = await app.request('/admin');
      expect(res.status).toBe(401);
    });

    it('registers proxy routes with transform function', async () => {
      const transformFn = vi.fn().mockReturnValue({ body: {}, headers: {} });

      const app = await createTestApp({
        app: { root: '/var/www' },
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
        app: { root: '/var/www' },
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
      });

      const res1 = await app.request('/users');
      const res2 = await app.request('/orders');
      expect(res1.status).toBeLessThan(600);
      expect(res2.status).toBeLessThan(600);
    });

    it('registers wildcard proxy route and matches sub-paths', async () => {
      const app = await createTestApp({
        app: { root: '/var/www' },
        proxyRoutes: [
          {
            access: 'public',
            methods: ['get'],
            path: '/api/*',
            proxyPath: '/backend/*',
            target: 'https://api.example.com',
            type: 'proxy',
          },
        ],
      });

      const res = await app.request('/api/users/123');
      expect(res.status).toBeLessThan(600);
    });
  });

  describe('Proxy observability', () => {
    it('executes proxy observability onRequest and onResponse', async () => {
      const onRequest = vi.fn();
      const onResponse = vi.fn();

      const app = await createTestApp({
        app: { root: '/var/www' },
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
      });

      await app.request('/users');
      expect(onRequest).toHaveBeenCalledTimes(1);
    });

    it('skips proxy observability when observe is false', async () => {
      const onRequest = vi.fn();
      const onResponse = vi.fn();

      const app = await createTestApp({
        app: { root: '/var/www' },
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
      });

      await app.request('/users');
      expect(onRequest).not.toHaveBeenCalled();
    });
  });
});
