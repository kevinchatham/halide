import { Hono } from 'hono';
import { createNoopLogger } from '../config/defaults';
import { createOpenApiRoutes } from '../middleware/swagger';
import type { Logger, ServerConfig } from '../types';
import { registerRoutes } from './registry';

const noopLogger: Logger = createNoopLogger();

type HalideVariables = { rawBody?: unknown };

function createTestApp(config: ServerConfig): Hono<{ Variables: HalideVariables }> {
  const app = new Hono<{ Variables: HalideVariables }>();
  registerRoutes(app, config, noopLogger);
  createOpenApiRoutes(config, app as unknown as Hono);
  return app;
}

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
  });
});
