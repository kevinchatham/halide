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
});
