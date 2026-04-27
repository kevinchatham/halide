import { Hono } from 'hono';
import { z } from 'zod';
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

describe('registerRoutes — openapi', () => {
  describe('OpenAPI metadata', () => {
    it('registers route with openapi responses containing schema', async () => {
      const app = createTestApp({
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
      const app = createTestApp({
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
      const app = createTestApp({
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

    it('auto-documents request body from validationSchema', async () => {
      const schema = z.object({ email: z.string().email(), name: z.string() });
      const app = createTestApp({
        apiRoutes: [
          {
            access: 'public',
            handler: async () => ({ ok: true }),
            method: 'post',
            path: '/users',
            type: 'api',
            validationSchema: schema,
          },
        ],
        openapi: { enabled: true },
        spa: { root: '/var/www' },
      });

      const res = await app.request('/users', {
        body: JSON.stringify({ email: 'test@example.com', name: 'test' }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });
      expect(res.status).toBe(200);

      const specRes = await app.request('/swagger/openapi.json');
      expect(specRes.status).toBe(200);
      const spec = await specRes.json();
      const postUsers = spec.paths['/users']?.post;
      expect(postUsers?.requestBody).toBeDefined();
      expect(postUsers.requestBody.required).toBe(true);
      const bodySchema = postUsers.requestBody.content['application/json'].schema;
      expect(bodySchema).toBeDefined();
      expect(bodySchema.vendor).toBe('zod');
    });

    it('uses openapi.requestSchema over validationSchema for request body docs', async () => {
      const validationSchema = z.object({ name: z.string() });
      const requestSchema = z.object({ email: z.string().email(), name: z.string() });
      const app = createTestApp({
        apiRoutes: [
          {
            access: 'public',
            handler: async () => ({ ok: true }),
            method: 'post',
            openapi: {
              requestSchema,
            },
            path: '/users',
            type: 'api',
            validationSchema,
          },
        ],
        openapi: { enabled: true },
        spa: { root: '/var/www' },
      });

      const res = await app.request('/users', {
        body: JSON.stringify({ name: 'test' }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });
      expect(res.status).toBe(200);

      const specRes = await app.request('/swagger/openapi.json');
      expect(specRes.status).toBe(200);
      const spec = await specRes.json();
      const postUsers = spec.paths['/users']?.post;
      expect(postUsers?.requestBody).toBeDefined();
      expect(postUsers.requestBody.required).toBe(true);
      const bodySchema = postUsers.requestBody.content['application/json'].schema;
      expect(bodySchema).toBeDefined();
      expect(bodySchema).toEqual({ vendor: 'zod' });

      const getUsers = spec.paths['/users']?.get;
      expect(getUsers).toBeUndefined();
    });

    it('marks request body as not required when schema is optional', async () => {
      const schema = z.object({ name: z.string() }).optional();
      const app = createTestApp({
        apiRoutes: [
          {
            access: 'public',
            handler: async () => ({ ok: true }),
            method: 'post',
            path: '/users',
            type: 'api',
            validationSchema: schema,
          },
        ],
        openapi: { enabled: true },
        spa: { root: '/var/www' },
      });

      const specRes = await app.request('/swagger/openapi.json');
      expect(specRes.status).toBe(200);
      const spec = await specRes.json();
      const postUsers = spec.paths['/users']?.post;
      expect(postUsers?.requestBody).toBeDefined();
      expect(postUsers.requestBody.required).toBe(false);
      expect(postUsers.requestBody.content['application/json'].schema).toBeDefined();
    });

    it('marks request body as not required when schema is nullable', async () => {
      const schema = z.object({ name: z.string() }).nullable();
      const app = createTestApp({
        apiRoutes: [
          {
            access: 'public',
            handler: async () => ({ ok: true }),
            method: 'post',
            path: '/items',
            type: 'api',
            validationSchema: schema,
          },
        ],
        openapi: { enabled: true },
        spa: { root: '/var/www' },
      });

      const specRes = await app.request('/swagger/openapi.json');
      expect(specRes.status).toBe(200);
      const spec = await specRes.json();
      const postItems = spec.paths['/items']?.post;
      expect(postItems?.requestBody).toBeDefined();
      expect(postItems.requestBody.required).toBe(false);
      expect(postItems.requestBody.content['application/json'].schema).toBeDefined();
    });

    it('populates requestBody from validationSchema in generated spec', async () => {
      const schema = z.object({ email: z.string().email(), name: z.string() });
      const app = createTestApp({
        apiRoutes: [
          {
            access: 'public',
            handler: async () => ({ ok: true }),
            method: 'post',
            path: '/submit',
            type: 'api',
            validationSchema: schema,
          },
        ],
        openapi: { enabled: true },
        spa: { root: '/var/www' },
      });

      const specRes = await app.request('/swagger/openapi.json');
      expect(specRes.status).toBe(200);
      const spec = await specRes.json();
      const postSubmit = spec.paths['/submit']?.post;
      expect(postSubmit?.requestBody).toBeDefined();
      expect(postSubmit.requestBody.required).toBe(true);
      const bodySchema = postSubmit.requestBody.content['application/json'].schema;
      expect(bodySchema).toBeDefined();
      expect(bodySchema.vendor).toBe('zod');
    });
  });
});
