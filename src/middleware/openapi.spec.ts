import { Hono } from 'hono';
import type { ProxyRoute } from '../types/api';
import type { ServerConfig } from '../types/server-config';
import { createOpenApiRoutes, createSpecCacheState, resetOpenApiCache } from './openapi';

function makeConfig(overrides: Partial<ServerConfig['openapi']> = {}): ServerConfig {
  return {
    app: { root: '.' },
    openapi: { enabled: true, ...overrides },
  };
}

function makeProxyRoute(overrides: Partial<ProxyRoute> = {}): ProxyRoute {
  return {
    access: 'public',
    methods: ['get'],
    path: '/api/users',
    target: 'https://api.example.com',
    type: 'proxy',
    ...overrides,
  } as ProxyRoute;
}

describe('createOpenApiRoutes', () => {
  let specState: import('./openapi').SpecCacheState;
  beforeEach(() => {
    specState = createSpecCacheState();
    resetOpenApiCache(specState);
  });
  it('does not register routes when openapi is disabled', async () => {
    const app = new Hono();
    const config: ServerConfig = { app: { root: '.' } };
    createOpenApiRoutes(config, app, specState);

    const res = await app.request('/swagger');
    expect(res.status).toBe(404);
  });

  it('does not register routes when openapi.enabled is false', async () => {
    const app = new Hono();
    const config: ServerConfig = { app: { root: '.' }, openapi: { enabled: false } };
    createOpenApiRoutes(config, app, specState);

    const res = await app.request('/swagger');
    expect(res.status).toBe(404);
  });

  it('registers routes with default path /swagger', async () => {
    const app = new Hono();
    createOpenApiRoutes(makeConfig(), app, specState);

    const res = await app.request('/swagger');
    expect(res.status).toBe(200);
  });

  it('registers openapi.json at the configured path', async () => {
    const app = new Hono();
    createOpenApiRoutes(makeConfig(), app, specState);

    const res = await app.request('/swagger/openapi.json');
    expect(res.status).toBe(200);
  });

  it('uses a custom path when configured', async () => {
    const app = new Hono();
    createOpenApiRoutes(makeConfig({ path: '/docs' }), app, specState);

    const res = await app.request('/docs');
    expect(res.status).toBe(200);

    const jsonRes = await app.request('/docs/openapi.json');
    expect(jsonRes.status).toBe(200);
  });

  it('does not register routes on the default path when a custom path is set', async () => {
    const app = new Hono();
    createOpenApiRoutes(makeConfig({ path: '/api-docs' }), app, specState);

    const res = await app.request('/swagger');
    expect(res.status).toBe(404);
  });

  it('returns openapi.json with default title and version', async () => {
    const app = new Hono();
    createOpenApiRoutes(makeConfig(), app, specState);

    const res = await app.request('/swagger/openapi.json');
    const body = (await res.json()) as { info: { title: string; version: string } };

    expect(body.info.title).toBe('Halide API');
    expect(body.info.version).toBe('1.0.0');
  });

  it('returns openapi.json with custom title and version', async () => {
    const app = new Hono();
    createOpenApiRoutes(
      makeConfig({ options: { title: 'My API', version: '2.0.0' } }),
      app,
      specState,
    );

    const res = await app.request('/swagger/openapi.json');
    const body = (await res.json()) as { info: { title: string; version: string } };

    expect(body.info.title).toBe('My API');
    expect(body.info.version).toBe('2.0.0');
  });

  it('includes description in openapi.json when configured', async () => {
    const app = new Hono();
    createOpenApiRoutes(makeConfig({ options: { description: 'A test API' } }), app, specState);

    const res = await app.request('/swagger/openapi.json');
    const body = (await res.json()) as { info: { description?: string } };

    expect(body.info.description).toBe('A test API');
  });

  it('does not override a default description when not configured', async () => {
    const app = new Hono();
    createOpenApiRoutes(makeConfig(), app, specState);

    const res = await app.request('/swagger/openapi.json');
    const body = (await res.json()) as { info: { description?: string } };

    expect(body.info.description).not.toBe('A test API');
  });

  it('includes servers in openapi.json when configured', async () => {
    const app = new Hono();
    createOpenApiRoutes(
      makeConfig({ options: { servers: [{ url: 'https://api.example.com' }] } }),
      app,
      specState,
    );

    const res = await app.request('/swagger/openapi.json');
    const body = (await res.json()) as { servers?: Array<{ url: string }> };

    expect(body.servers).toEqual([{ url: 'https://api.example.com' }]);
  });

  it('omits servers from openapi.json when not configured', async () => {
    const app = new Hono();
    createOpenApiRoutes(makeConfig(), app, specState);

    const res = await app.request('/swagger/openapi.json');
    const body = (await res.json()) as { servers?: unknown };

    expect(body.servers).toBeUndefined();
  });

  it('merges external OpenAPI spec from file path', async () => {
    const app = new Hono();
    const proxyRoute = makeProxyRoute({
      openapiSpec: { path: 'test/fixtures/test-spec.json' },
    });
    createOpenApiRoutes({ ...makeConfig(), proxyRoutes: [proxyRoute] }, app, specState);

    const res = await app.request('/swagger/openapi.json');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('paths');
  });

  it('merges external OpenAPI spec from URL', async () => {
    const mockSpec = JSON.stringify({
      info: { title: 'Mock API', version: '1.0.0' },
      openapi: '3.1.0',
      paths: { '/users': { get: { summary: 'Get users' } } },
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

    const app = new Hono();
    const proxyRoute = makeProxyRoute({
      openapiSpec: { path: 'https://api.example.com/openapi.json' },
    });
    createOpenApiRoutes({ ...makeConfig(), proxyRoutes: [proxyRoute] }, app, specState);

    const res = await app.request('/swagger/openapi.json');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('paths');
  });

  it('applies openapi metadata overrides to merged external spec', async () => {
    const app = new Hono();
    const proxyRoute = makeProxyRoute({
      openapi: {
        description: 'Proxy to users service',
        summary: 'Users API',
        tags: ['users'],
      },
      openapiSpec: { path: 'test/fixtures/test-spec.json' },
    });
    createOpenApiRoutes({ ...makeConfig(), proxyRoutes: [proxyRoute] }, app, specState);

    const res = await app.request('/swagger/openapi.json');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('paths');
  });

  it('caches the resolved spec on first request', async () => {
    const app = new Hono();
    const proxyRoute = makeProxyRoute({
      openapiSpec: { path: 'test/fixtures/test-spec.json' },
    });
    createOpenApiRoutes({ ...makeConfig(), proxyRoutes: [proxyRoute] }, app, specState);

    const res1 = await app.request('/swagger/openapi.json');
    expect(res1.status).toBe(200);
    const body1 = await res1.json();

    const res2 = await app.request('/swagger/openapi.json');
    expect(res2.status).toBe(200);
    const body2 = await res2.json();

    expect(JSON.stringify(body1)).toEqual(JSON.stringify(body2));
  });

  it('merges external spec paths without appending method to path key', async () => {
    const mockSpec = JSON.stringify({
      info: { title: 'Mock API', version: '1.0.0' },
      openapi: '3.1.0',
      paths: {
        '/users': { get: { summary: 'Get users' }, post: { summary: 'Create user' } },
        '/users/{id}': { delete: { summary: 'Delete user' }, get: { summary: 'Get user' } },
      },
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

    const app = new Hono();
    const proxyRoute = makeProxyRoute({
      methods: ['get', 'post', 'delete'],
      openapiSpec: { path: 'https://api.example.com/openapi.json' },
    });
    createOpenApiRoutes({ ...makeConfig(), proxyRoutes: [proxyRoute] }, app, specState);

    const res = await app.request('/swagger/openapi.json');
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(Object.keys(body.paths)).toEqual(['/users', '/users/{id}']);
    expect(body.paths['/users'].get).toBeDefined();
    expect(body.paths['/users'].post).toBeDefined();
    expect(body.paths['/users/{id}'].get).toBeDefined();
    expect(body.paths['/users/{id}'].delete).toBeDefined();
  });

  it('filters external spec operations by route methods', async () => {
    const mockSpec = JSON.stringify({
      info: { title: 'Mock API', version: '1.0.0' },
      openapi: '3.1.0',
      paths: {
        '/items': {
          delete: { summary: 'Delete item' },
          get: { summary: 'Get items' },
          post: { summary: 'Create item' },
          put: { summary: 'Update item' },
        },
      },
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

    const app = new Hono();
    const proxyRoute = makeProxyRoute({
      methods: ['get', 'delete'],
      openapiSpec: { path: 'https://api.example.com/openapi.json' },
    });
    createOpenApiRoutes({ ...makeConfig(), proxyRoutes: [proxyRoute] }, app, specState);

    const res = await app.request('/swagger/openapi.json');
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.paths['/items'].get).toBeDefined();
    expect(body.paths['/items'].delete).toBeDefined();
    expect(body.paths['/items'].post).toBeUndefined();
    expect(body.paths['/items'].put).toBeUndefined();
  });
});
