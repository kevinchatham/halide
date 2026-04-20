import { Hono } from 'hono';
import type { ServerConfig } from '../types';
import { createOpenApiRoutes } from './swagger';

function makeConfig(overrides: Partial<ServerConfig['openapi']> = {}): ServerConfig {
  return {
    openapi: { enabled: true, ...overrides },
    spa: { root: '.' },
  };
}

describe('createOpenApiRoutes', () => {
  it('does not register routes when openapi is disabled', async () => {
    const app = new Hono();
    const config: ServerConfig = { spa: { root: '.' } };
    createOpenApiRoutes(config, app);

    const res = await app.request('/swagger');
    expect(res.status).toBe(404);
  });

  it('does not register routes when openapi.enabled is false', async () => {
    const app = new Hono();
    const config: ServerConfig = { openapi: { enabled: false }, spa: { root: '.' } };
    createOpenApiRoutes(config, app);

    const res = await app.request('/swagger');
    expect(res.status).toBe(404);
  });

  it('registers routes with default path /swagger', async () => {
    const app = new Hono();
    createOpenApiRoutes(makeConfig(), app);

    const res = await app.request('/swagger');
    expect(res.status).toBe(200);
  });

  it('registers openapi.json at the configured path', async () => {
    const app = new Hono();
    createOpenApiRoutes(makeConfig(), app);

    const res = await app.request('/swagger/openapi.json');
    expect(res.status).toBe(200);
  });

  it('uses a custom path when configured', async () => {
    const app = new Hono();
    createOpenApiRoutes(makeConfig({ path: '/docs' }), app);

    const res = await app.request('/docs');
    expect(res.status).toBe(200);

    const jsonRes = await app.request('/docs/openapi.json');
    expect(jsonRes.status).toBe(200);
  });

  it('does not register routes on the default path when a custom path is set', async () => {
    const app = new Hono();
    createOpenApiRoutes(makeConfig({ path: '/api-docs' }), app);

    const res = await app.request('/swagger');
    expect(res.status).toBe(404);
  });

  it('returns openapi.json with default title and version', async () => {
    const app = new Hono();
    createOpenApiRoutes(makeConfig(), app);

    const res = await app.request('/swagger/openapi.json');
    const body = (await res.json()) as { info: { title: string; version: string } };

    expect(body.info.title).toBe('Halide API');
    expect(body.info.version).toBe('1.0.0');
  });

  it('returns openapi.json with custom title and version', async () => {
    const app = new Hono();
    createOpenApiRoutes(makeConfig({ options: { title: 'My API', version: '2.0.0' } }), app);

    const res = await app.request('/swagger/openapi.json');
    const body = (await res.json()) as { info: { title: string; version: string } };

    expect(body.info.title).toBe('My API');
    expect(body.info.version).toBe('2.0.0');
  });

  it('includes description in openapi.json when configured', async () => {
    const app = new Hono();
    createOpenApiRoutes(makeConfig({ options: { description: 'A test API' } }), app);

    const res = await app.request('/swagger/openapi.json');
    const body = (await res.json()) as { info: { description?: string } };

    expect(body.info.description).toBe('A test API');
  });

  it('does not override a default description when not configured', async () => {
    const app = new Hono();
    createOpenApiRoutes(makeConfig(), app);

    const res = await app.request('/swagger/openapi.json');
    const body = (await res.json()) as { info: { description?: string } };

    expect(body.info.description).not.toBe('A test API');
  });

  it('includes servers in openapi.json when configured', async () => {
    const app = new Hono();
    createOpenApiRoutes(
      makeConfig({ options: { servers: [{ url: 'https://api.example.com' }] } }),
      app,
    );

    const res = await app.request('/swagger/openapi.json');
    const body = (await res.json()) as { servers?: Array<{ url: string }> };

    expect(body.servers).toEqual([{ url: 'https://api.example.com' }]);
  });

  it('omits servers from openapi.json when not configured', async () => {
    const app = new Hono();
    createOpenApiRoutes(makeConfig(), app);

    const res = await app.request('/swagger/openapi.json');
    const body = (await res.json()) as { servers?: unknown };

    expect(body.servers).toBeUndefined();
  });
});
