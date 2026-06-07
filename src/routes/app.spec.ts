import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildHonoApp } from '../utils/hono';
import { createAppHandler } from './app';

describe('createAppHandler', () => {
  it('returns staticMiddleware and appFallback', () => {
    const { staticMiddleware, appFallback } = createAppHandler({
      fallback: 'index.html',
      name: 'test-app',
      root: '/var/www',
    });

    expect(typeof staticMiddleware).toBe('function');
    expect(typeof appFallback).toBe('function');
  });

  it('fallback returns 404 for /api paths', async () => {
    const app = buildHonoApp();
    const { appFallback } = createAppHandler({
      apiPrefix: '/api',
      fallback: 'index.html',
      name: 'test-app',
      root: '/var/www',
    });
    app.all('/*', appFallback);

    const res = await app.request('/api/users');

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ error: 'Not Found' });
  });

  it('fallback returns 404 for paths matching custom apiPrefix', async () => {
    const app = buildHonoApp();
    const { appFallback } = createAppHandler({
      apiPrefix: '/v1',
      fallback: 'index.html',
      name: 'test-app',
      root: '/var/www',
    });
    app.all('/*', appFallback);

    const res = await app.request('/v1/users');

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ error: 'Not Found' });
  });

  it('fallback returns notFound when file does not exist', async () => {
    const app = buildHonoApp();
    const { appFallback } = createAppHandler({
      fallback: 'index.html',
      name: 'test-app',
      root: '/nonexistent',
    });
    app.all('/*', appFallback);

    const res = await app.request('/about');

    expect(res.status).toBe(404);
  });

  it('fallback serves html when file exists', async () => {
    const app = buildHonoApp();
    const { appFallback } = createAppHandler({
      fallback: 'index.html',
      name: 'test-app',
      root: '/var/www',
    });
    app.all('/*', appFallback);

    const res = await app.request('/about');

    expect(res.status).toBe(404);
  });

  it('uses custom fallback file', async () => {
    const { appFallback } = createAppHandler({
      fallback: 'app.html',
      name: 'test-app',
      root: '/public',
    });

    expect(typeof appFallback).toBe('function');
  });

  it('fallback tries to serve file when apiPrefix is empty string', async () => {
    const app = buildHonoApp();
    const { appFallback } = createAppHandler({
      apiPrefix: '',
      fallback: 'index.html',
      name: 'test-app',
      root: '/var/www',
    });
    app.all('/*', appFallback);

    const res = await app.request('/api/users');

    expect(res.status).toBe(404);
  });

  it('fallback tries to serve file for paths not matching custom apiPrefix', async () => {
    const app = buildHonoApp();
    const { appFallback } = createAppHandler({
      apiPrefix: '/graphql',
      fallback: 'index.html',
      name: 'test-app',
      root: '/var/www',
    });
    app.all('/*', appFallback);

    const res = await app.request('/about');

    expect(res.status).toBe(404);
  });

  it('serves HTML content when file exists on disk', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'halide-app-'));
    try {
      await fs.writeFile(path.join(tmpDir, 'index.html'), '<html><body>Hello</body></html>');
      const app = buildHonoApp();
      const { appFallback } = createAppHandler({
        fallback: 'index.html',
        name: 'test-app',
        root: tmpDir,
      });
      app.all('/*', appFallback);

      const res = await app.request('/about');

      expect(res.status).toBe(200);
      const body = await res.text();
      expect(body).toBe('<html><body>Hello</body></html>');
    } finally {
      await fs.rm(tmpDir, { force: true, recursive: true });
    }
  });
});
