import { Hono } from 'hono';
import { createSpaHandler } from './spa';

describe('createSpaHandler', () => {
  it('returns staticMiddleware and spaFallback', () => {
    const { staticMiddleware, spaFallback } = createSpaHandler({
      fallback: 'index.html',
      name: 'test-app',
      root: '/var/www',
    });

    expect(typeof staticMiddleware).toBe('function');
    expect(typeof spaFallback).toBe('function');
  });

  it('fallback returns 404 for /api paths', async () => {
    const app = new Hono();
    const { spaFallback } = createSpaHandler({
      apiPrefix: '/api',
      fallback: 'index.html',
      name: 'test-app',
      root: '/var/www',
    });
    app.all('/*', spaFallback);

    const res = await app.request('/api/users');

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ error: 'Not Found' });
  });

  it('fallback returns 404 for paths matching custom apiPrefix', async () => {
    const app = new Hono();
    const { spaFallback } = createSpaHandler({
      apiPrefix: '/v1',
      fallback: 'index.html',
      name: 'test-app',
      root: '/var/www',
    });
    app.all('/*', spaFallback);

    const res = await app.request('/v1/users');

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ error: 'Not Found' });
  });

  it('fallback returns notFound when file does not exist', async () => {
    const app = new Hono();
    const { spaFallback } = createSpaHandler({
      fallback: 'index.html',
      name: 'test-app',
      root: '/nonexistent',
    });
    app.all('/*', spaFallback);

    const res = await app.request('/about');

    expect(res.status).toBe(404);
  });

  it('fallback serves html when file exists', async () => {
    const app = new Hono();
    const { spaFallback } = createSpaHandler({
      fallback: 'index.html',
      name: 'test-app',
      root: '/var/www',
    });
    app.all('/*', spaFallback);

    const res = await app.request('/about');

    expect(res.status).toBe(404);
  });

  it('uses custom fallback file', async () => {
    const { spaFallback } = createSpaHandler({
      fallback: 'app.html',
      name: 'test-app',
      root: '/public',
    });

    expect(typeof spaFallback).toBe('function');
  });

  it('fallback tries to serve file when apiPrefix is empty string', async () => {
    const app = new Hono();
    const { spaFallback } = createSpaHandler({
      apiPrefix: '',
      fallback: 'index.html',
      name: 'test-app',
      root: '/var/www',
    });
    app.all('/*', spaFallback);

    const res = await app.request('/api/users');

    expect(res.status).toBe(404);
  });

  it('fallback tries to serve file for paths not matching custom apiPrefix', async () => {
    const app = new Hono();
    const { spaFallback } = createSpaHandler({
      apiPrefix: '/graphql',
      fallback: 'index.html',
      name: 'test-app',
      root: '/var/www',
    });
    app.all('/*', spaFallback);

    const res = await app.request('/about');

    expect(res.status).toBe(404);
  });
});
