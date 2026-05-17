import { z } from 'zod';
import { createTestApp } from '../test-utils/index.js';
import type { ProxyRoute } from '../types/api';
import { resolveOpenApiSpec } from './registry.openapi';

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
        app: { root: '/var/www' },
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
        app: { root: '/var/www' },
      });

      const res = await app.request('/test');
      expect(res.status).toBe(200);
    });

    it('auto-documents request body from requestSchema', async () => {
      const schema = z.object({ email: z.string().email(), name: z.string() });
      const app = createTestApp({
        apiRoutes: [
          {
            access: 'public',
            handler: async () => ({ ok: true }),
            method: 'post',
            path: '/users',
            requestSchema: schema,
            type: 'api',
          },
        ],
        app: { root: '/var/www' },
        openapi: { enabled: true },
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

    it('marks request body as not required when schema is optional', async () => {
      const schema = z.object({ name: z.string() }).optional();
      const app = createTestApp({
        apiRoutes: [
          {
            access: 'public',
            handler: async () => ({ ok: true }),
            method: 'post',
            path: '/users',
            requestSchema: schema,
            type: 'api',
          },
        ],
        app: { root: '/var/www' },
        openapi: { enabled: true },
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
            requestSchema: schema,
            type: 'api',
          },
        ],
        app: { root: '/var/www' },
        openapi: { enabled: true },
      });

      const specRes = await app.request('/swagger/openapi.json');
      expect(specRes.status).toBe(200);
      const spec = await specRes.json();
      const postItems = spec.paths['/items']?.post;
      expect(postItems?.requestBody).toBeDefined();
      expect(postItems.requestBody.required).toBe(false);
      expect(postItems.requestBody.content['application/json'].schema).toBeDefined();
    });

    it('populates requestBody from requestSchema in generated spec', async () => {
      const schema = z.object({ email: z.string().email(), name: z.string() });
      const app = createTestApp({
        apiRoutes: [
          {
            access: 'public',
            handler: async () => ({ ok: true }),
            method: 'post',
            path: '/submit',
            requestSchema: schema,
            type: 'api',
          },
        ],
        app: { root: '/var/www' },
        openapi: { enabled: true },
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

    it('documents responseSchema in OpenAPI output', async () => {
      const app = createTestApp({
        apiRoutes: [
          {
            access: 'public',
            handler: async () => ({ id: 1, name: 'test' }),
            path: '/items',
            responseSchema: z.object({ id: z.number(), name: z.string() }),
            type: 'api',
          },
        ],
        app: { root: '/var/www' },
        openapi: { enabled: true },
      });

      const specRes = await app.request('/swagger/openapi.json');
      expect(specRes.status).toBe(200);
      const spec = await specRes.json();
      const getItems = spec.paths['/items']?.get;
      expect(getItems?.responses['200']).toBeDefined();
      expect(getItems.responses['200'].content).toBeDefined();
      expect(getItems.responses['200'].content['application/json'].schema).toBeDefined();
    });

    it('uses openapi.responses over responseSchema for response docs', async () => {
      const app = createTestApp({
        apiRoutes: [
          {
            access: 'public',
            handler: async () => ({ id: 1 }),
            openapi: {
              responses: {
                '200': { description: 'Custom OK', schema: z.object({ custom: z.boolean() }) },
              },
            },
            path: '/items',
            responseSchema: z.object({ id: z.number() }),
            type: 'api',
          },
        ],
        app: { root: '/var/www' },
        openapi: { enabled: true },
      });

      const specRes = await app.request('/swagger/openapi.json');
      expect(specRes.status).toBe(200);
      const spec = await specRes.json();
      const getItems = spec.paths['/items']?.get;
      expect(getItems?.responses['200'].description).toBe('Custom OK');
    });
  });

  describe('OpenAPI spec resolution', () => {
    it('throws error when fetch times out', async () => {
      const fetchMock = vi.fn().mockReturnValue(
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error('AbortError')), 50);
        }),
      );
      const originalFetch = global.fetch;
      global.fetch = fetchMock as typeof global.fetch;

      try {
        await resolveOpenApiSpec([
          {
            methods: ['get'],
            openapiSpec: { path: 'http://localhost:9999/spec.json' },
            path: '/test',
            type: 'proxy',
          } as ProxyRoute<unknown>,
        ]);
        // Should not reach here
        expect(true).toBe(false);
      } catch (err) {
        expect(err).toBeInstanceOf(Error);
      } finally {
        global.fetch = originalFetch;
      }
    });
  });
});
