import { createTestApp } from '../test-utils';

describe('registerRoutes — authorization', () => {
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
        app: { root: '/var/www' },
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
        app: { root: '/var/www' },
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
        app: { root: '/var/www' },
      });

      const res = await app.request('/items');
      expect(res.status).toBe(403);
    });
  });

  describe('Proxy authorization', () => {
    it('returns 403 when proxy authorize returns false', async () => {
      const app = await createTestApp({
        app: { root: '/var/www' },
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
      });

      const res = await app.request('/admin');
      expect(res.status).toBe(403);
    });

    it('returns 403 when proxy authorize throws', async () => {
      const app = await createTestApp({
        app: { root: '/var/www' },
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
      });

      const res = await app.request('/admin');
      expect(res.status).toBe(403);
    });
  });
});
