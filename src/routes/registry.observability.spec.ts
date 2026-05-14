import { Hono } from 'hono';
import { createAgentCache } from '../services/proxy';
import { createTestApp, noopLogger } from '../test-utils/index.js';
import { registerRoutes } from './registry';

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
        createAgentCache(),
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

    it('logs error when async onRequest hook throws', async () => {
      const errorLogger = {
        error: vi.fn(),
      };
      const onRequest = vi.fn().mockReturnValue(Promise.reject(new Error('hook failed')));
      const onResponse = vi.fn();

      const app = new Hono<{ Variables: HalideVariables }>();
      const agentCache = createAgentCache();
      await registerRoutes(
        app,
        {
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
        },
        errorLogger as unknown as typeof noopLogger,
        agentCache,
      );

      const res = await app.request('/items');
      expect(res.status).toBe(200);
      expect(onRequest).toHaveBeenCalledTimes(1);
      expect(onResponse).toHaveBeenCalledTimes(1);
      expect(errorLogger.error).toHaveBeenCalled();
      expect(errorLogger.error.mock.calls[0]![1]).toContain('onRequest hook');
      expect(errorLogger.error.mock.calls[0]![1]).toContain('hook failed');
    });

    it('logs error when sync onRequest hook throws', async () => {
      const errorLogger = {
        error: vi.fn(),
      };
      const onRequest = vi.fn(() => {
        throw new Error('sync hook failed');
      });
      const onResponse = vi.fn();

      const app = new Hono<{ Variables: HalideVariables }>();
      const agentCache = createAgentCache();
      await registerRoutes(
        app,
        {
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
        },
        errorLogger as unknown as typeof noopLogger,
        agentCache,
      );

      const res = await app.request('/items');
      expect(res.status).toBe(200);
      expect(onRequest).toHaveBeenCalledTimes(1);
      expect(errorLogger.error).toHaveBeenCalled();
      expect(errorLogger.error.mock.calls[0]![1]).toContain('onRequest hook');
    });

    it('logs error when async onResponse hook throws', async () => {
      const errorLogger = {
        error: vi.fn(),
      };
      const onRequest = vi.fn();
      const onResponse = vi.fn().mockReturnValue(Promise.reject(new Error('response hook failed')));

      const app = new Hono<{ Variables: HalideVariables }>();
      const agentCache = createAgentCache();
      await registerRoutes(
        app,
        {
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
        },
        errorLogger as unknown as typeof noopLogger,
        agentCache,
      );

      const res = await app.request('/items');
      expect(res.status).toBe(200);
      expect(onRequest).toHaveBeenCalledTimes(1);
      expect(onResponse).toHaveBeenCalledTimes(1);
      expect(errorLogger.error).toHaveBeenCalled();
      expect(errorLogger.error.mock.calls[0]![1]).toContain('onResponse hook');
      expect(errorLogger.error.mock.calls[0]![1]).toContain('response hook failed');
    });
  });
});
