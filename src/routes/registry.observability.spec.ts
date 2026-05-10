import { Hono } from 'hono';
import { registerRoutes } from './registry';
import { createTestApp, noopLogger } from './registry.helpers';

type HalideVariables = { rawBody?: unknown };

describe('registerRoutes — observability', () => {
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
        app: { root: '/var/www' },
        observability: { onRequest, onResponse },
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
        app: { root: '/var/www' },
        observability: { onRequest, onResponse },
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
        app: { root: '/var/www' },
        observability: {},
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
          app: { root: '/var/www' },
          observability: { onResponse },
        },
        noopLogger,
      );

      await app.request('/items');

      expect(onResponse).toHaveBeenCalledTimes(1);
      const call = onResponse.mock.calls[0]!;
      expect(call[2].statusCode).toBe(500);
      expect(call[2].error).toBeInstanceOf(Error);
    });

    it('passes response body to onResponse hook', async () => {
      const onResponse = vi.fn();

      const app = await createTestApp({
        apiRoutes: [
          {
            access: 'public',
            handler: async () => ({ data: [1, 2, 3], ok: true }),
            path: '/items',
            type: 'api',
          },
        ],
        app: { root: '/var/www' },
        observability: { onResponse },
      });

      await app.request('/items');

      expect(onResponse).toHaveBeenCalledTimes(1);
      const call = onResponse.mock.calls[0]!;
      expect(call[2].body).toEqual({ data: [1, 2, 3], ok: true });
    });
  });
});
