import { Hono } from 'hono';
import type { ApiRoute, ProxyRoute } from '../types/api';
import type { HalideVariables } from '../types/app';
import { createApiBodyParser, createProxyBodyParser } from './registry.body';

describe('createApiBodyParser', () => {
  it('skips body parsing for GET methods', async () => {
    const route = {
      access: 'public' as const,
      handler: async () => ({ ok: true }),
      method: 'get' as const,
      path: '/test',
      type: 'api' as const,
    } satisfies ApiRoute;

    let capturedBody: unknown;
    const app = new Hono<{ Variables: HalideVariables }>();
    app.use('/test', createApiBodyParser(route));
    app.get('/test', (c) => {
      capturedBody = c.get('parsedBody');
      return c.json({ ok: true });
    });

    const res = await app.request('/test');
    expect(res.status).toBe(200);
    expect(capturedBody).toBeUndefined();
  });

  it('skips body parsing for HEAD methods', async () => {
    const route = {
      access: 'public' as const,
      handler: async () => ({ ok: true }),
      method: 'get' as const,
      path: '/test',
      type: 'api' as const,
    } satisfies ApiRoute;

    const app = new Hono<{ Variables: HalideVariables }>();
    app.use('/test', createApiBodyParser(route));
    app.all('/test', (c) => c.text('ok'));

    const res = await app.request('/test', { method: 'HEAD' });
    expect(res.status).toBe(200);
  });

  it('parses JSON body for POST methods', async () => {
    const route = {
      access: 'public' as const,
      handler: async () => ({ ok: true }),
      method: 'post' as const,
      path: '/test',
      type: 'api' as const,
    } satisfies ApiRoute;

    let capturedBody: unknown;
    const app = new Hono<{ Variables: HalideVariables }>();
    app.use('/test', createApiBodyParser(route));
    app.post('/test', (c) => {
      capturedBody = c.get('parsedBody');
      return c.json({ ok: true });
    });

    const res = await app.request('/test', {
      body: JSON.stringify({ key: 'value' }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });
    expect(res.status).toBe(200);
    expect(capturedBody).toEqual({ key: 'value' });
  });

  it('parses JSON body for PUT methods', async () => {
    const route = {
      access: 'public' as const,
      handler: async () => ({ ok: true }),
      method: 'put' as const,
      path: '/test',
      type: 'api' as const,
    } satisfies ApiRoute;

    let capturedBody: unknown;
    const app = new Hono<{ Variables: HalideVariables }>();
    app.use('/test', createApiBodyParser(route));
    app.put('/test', (c) => {
      capturedBody = c.get('parsedBody');
      return c.json({ ok: true });
    });

    const res = await app.request('/test', {
      body: JSON.stringify({ updated: true }),
      headers: { 'Content-Type': 'application/json' },
      method: 'PUT',
    });
    expect(res.status).toBe(200);
    expect(capturedBody).toEqual({ updated: true });
  });

  it('parses JSON body for PATCH methods', async () => {
    const route = {
      access: 'public' as const,
      handler: async () => ({ ok: true }),
      method: 'patch' as const,
      path: '/test',
      type: 'api' as const,
    } satisfies ApiRoute;

    let capturedBody: unknown;
    const app = new Hono<{ Variables: HalideVariables }>();
    app.use('/test', createApiBodyParser(route));
    app.patch('/test', (c) => {
      capturedBody = c.get('parsedBody');
      return c.json({ ok: true });
    });

    const res = await app.request('/test', {
      body: JSON.stringify({ patched: true }),
      headers: { 'Content-Type': 'application/json' },
      method: 'PATCH',
    });
    expect(res.status).toBe(200);
    expect(capturedBody).toEqual({ patched: true });
  });

  it('returns 400 on invalid JSON', async () => {
    const route = {
      access: 'public' as const,
      handler: async () => ({ ok: true }),
      method: 'post' as const,
      path: '/test',
      type: 'api' as const,
    } satisfies ApiRoute;

    const app = new Hono<{ Variables: HalideVariables }>();
    app.use('/test', createApiBodyParser(route));
    app.post('/test', (c) => c.json({ ok: true }));

    const res = await app.request('/test', {
      body: 'not valid json {',
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json).toEqual({ error: 'Invalid JSON in request body' });
  });

  it('sets parsedBody and calls next() on success', async () => {
    const route = {
      access: 'public' as const,
      handler: async () => ({ ok: true }),
      method: 'post' as const,
      path: '/test',
      type: 'api' as const,
    } satisfies ApiRoute;

    let capturedBody: unknown;
    const app = new Hono<{ Variables: HalideVariables }>();
    app.use('/test', createApiBodyParser(route));
    app.post('/test', (c) => {
      capturedBody = c.get('parsedBody');
      return c.json({ ok: true });
    });

    const res = await app.request('/test', {
      body: JSON.stringify({ data: 'test' }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });
    expect(res.status).toBe(200);
    expect(capturedBody).toEqual({ data: 'test' });
  });
});

describe('createProxyBodyParser', () => {
  it('skips body parsing when no transform function', async () => {
    const route = {
      access: 'public' as const,
      methods: ['post'] as const,
      path: '/test',
      target: 'https://example.com',
      type: 'proxy' as const,
    } satisfies ProxyRoute;

    let capturedParsed: unknown;
    const app = new Hono<{ Variables: HalideVariables }>();
    app.use('/test', createProxyBodyParser(route));
    app.post('/test', (c) => {
      capturedParsed = c.get('parsedBody');
      return c.json({ ok: true });
    });

    const res = await app.request('/test', {
      body: JSON.stringify({ key: 'value' }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });
    expect(res.status).toBe(200);
    expect(capturedParsed).toBeUndefined();
  });

  it('parses body and sets parsedBody when transform exists', async () => {
    const route = {
      access: 'public' as const,
      methods: ['post'] as const,
      path: '/test',
      target: 'https://example.com',
      transform: () => ({ body: {}, headers: {} }),
      type: 'proxy' as const,
    } satisfies ProxyRoute;

    let capturedParsed: unknown;
    const app = new Hono<{ Variables: HalideVariables }>();
    app.use('/test', createProxyBodyParser(route));
    app.post('/test', (c) => {
      capturedParsed = c.get('parsedBody');
      return c.json({ ok: true });
    });

    const res = await app.request('/test', {
      body: JSON.stringify({ proxy: 'data' }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });
    expect(res.status).toBe(200);
    expect(capturedParsed).toEqual({ proxy: 'data' });
  });

  it('returns 400 on invalid JSON when transform exists', async () => {
    const route = {
      access: 'public' as const,
      methods: ['post'] as const,
      path: '/test',
      target: 'https://example.com',
      transform: () => ({ body: {}, headers: {} }),
      type: 'proxy' as const,
    } satisfies ProxyRoute;

    const app = new Hono<{ Variables: HalideVariables }>();
    app.use('/test', createProxyBodyParser(route));
    app.post('/test', (c) => c.json({ ok: true }));

    const res = await app.request('/test', {
      body: 'invalid <<< json',
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json).toEqual({ error: 'Invalid JSON in request body' });
  });
});
