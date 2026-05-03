import { Hono } from 'hono';
import { z } from 'zod';
import { createNoopLogger } from '../config/defaults';
import { createOpenApiRoutes } from '../middleware/swagger';
import type { Logger, ServerConfig } from '../types';
import { registerRoutes } from './registry';

const noopLogger: Logger<unknown> = createNoopLogger();

type HalideVariables = { rawBody?: unknown };

function createTestApp(config: ServerConfig): Hono<{ Variables: HalideVariables }> {
  const app = new Hono<{ Variables: HalideVariables }>();
  registerRoutes(app, config, noopLogger);
  createOpenApiRoutes(config, app as unknown as Hono);
  return app;
}

describe('registerRoutes', () => {
  it('does nothing when routes is missing', async () => {
    const app = createTestApp({
      app: { root: '/var/www' },
      security: { auth: { secret: () => 'test-secret', strategy: 'bearer' } },
    });

    const res = await app.request('/nonexistent');
    expect(res.status).toBe(404);
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
