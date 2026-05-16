import net from 'node:net';
import { createApp } from './runtime';

function _getFreePort(): number {
  const server = net.createServer();
  server.listen(0);
  const address = server.address() as net.AddressInfo;
  const port = address.port;
  server.close();
  return port;
}

const minimalConfig = { app: { root: '/var/www' } } as const;

describe('createApp', () => {
  it('returns an app and rateLimitDispose', async () => {
    const result = createApp(minimalConfig);
    expect(result.app).toBeDefined();
    expect(result.rateLimitDispose).toBeUndefined();
  });

  it('applies CORS with default allow-methods on preflight', async () => {
    const { app } = createApp(minimalConfig);
    const res = await app.request('/nonexistent', {
      headers: { origin: 'http://localhost:3000' },
      method: 'OPTIONS',
    });
    const allowMethods = res.headers.get('access-control-allow-methods') ?? '';
    expect(allowMethods).toContain('GET');
    expect(allowMethods).toContain('POST');
    expect(allowMethods).toContain('DELETE');
  });

  it('applies CORS with custom origin', async () => {
    const { app } = createApp({
      ...minimalConfig,
      security: { cors: { origin: ['http://localhost:3000'] } },
    });
    const res = await app.request('/nonexistent', {
      headers: { origin: 'http://localhost:3000' },
    });
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:3000');
  });

  it('applies CORS with custom methods', async () => {
    const { app } = createApp({
      ...minimalConfig,
      security: { cors: { methods: ['get', 'post'] } },
    });
    const res = await app.request('/nonexistent', { method: 'OPTIONS' });
    const allowMethods = res.headers.get('access-control-allow-methods') ?? '';
    expect(allowMethods).toContain('GET');
    expect(allowMethods).toContain('POST');
  });

  it('applies CORS credentials from config', async () => {
    const { app } = createApp({
      ...minimalConfig,
      security: {
        auth: { secret: 'secret', strategy: 'bearer' },
        cors: { credentials: true, origin: ['http://localhost:3000'] },
      },
    });
    const res = await app.request('/nonexistent', {
      headers: { origin: 'http://localhost:3000' },
    });
    expect(res.headers.get('access-control-allow-credentials')).toBe('true');
  });

  it('rejects requests without Origin header when credentials: true', async () => {
    const { app } = createApp({
      ...minimalConfig,
      security: {
        auth: { secret: 'secret', strategy: 'bearer' },
        cors: { credentials: true, origin: ['http://localhost:3000'] },
      },
    });
    const res = await app.request('/nonexistent', { method: 'POST' });
    expect(res.status).toBe(403);
  });

  it('rejects requests with unexpected Origin header when credentials: true', async () => {
    const { app } = createApp({
      ...minimalConfig,
      security: {
        auth: { secret: 'secret', strategy: 'bearer' },
        cors: { credentials: true, origin: ['http://localhost:3000'] },
      },
    });
    const res = await app.request('/nonexistent', {
      headers: { origin: 'http://evil.example.com' },
      method: 'POST',
    });
    expect(res.status).toBe(403);
  });

  it('allows requests with matching Origin header when credentials: true', async () => {
    const { app } = createApp({
      ...minimalConfig,
      security: {
        auth: { secret: 'secret', strategy: 'bearer' },
        cors: { credentials: true, origin: ['http://localhost:3000'] },
      },
    });
    const res = await app.request('/nonexistent', {
      headers: { origin: 'http://localhost:3000' },
      method: 'POST',
    });
    expect(res.status).not.toBe(403);
  });

  it('does not apply CSRF when credentials is false', async () => {
    const { app } = createApp({
      ...minimalConfig,
      security: {
        auth: { secret: 'secret', strategy: 'bearer' },
        cors: { origin: ['http://localhost:3000'] },
      },
    });
    const res = await app.request('/nonexistent', {
      headers: { origin: 'http://evil.example.com' },
      method: 'POST',
    });
    expect(res.status).not.toBe(403);
  });

  it('applies default CORS credentials as false', async () => {
    const { app } = createApp(minimalConfig);
    const res = await app.request('/nonexistent');
    expect(res.headers.get('access-control-allow-credentials')).toBeNull();
  });

  it('applies security headers with default CSP', async () => {
    const { app } = createApp(minimalConfig);
    const res = await app.request('/nonexistent');
    const csp = res.headers.get('Content-Security-Policy');
    expect(csp).toContain("'self'");
  });

  it('applies custom CSP directives', async () => {
    const { app } = createApp({
      ...minimalConfig,
      security: { csp: { defaultSrc: ["'none'"], scriptSrc: ["'none'"] } },
    });
    const res = await app.request('/nonexistent');
    const csp = res.headers.get('Content-Security-Policy') ?? '';
    expect(csp).toContain("'none'");
  });

  it('does not add request-id header when requestId is not configured', async () => {
    const { app } = createApp(minimalConfig);
    const res = await app.request('/nonexistent');
    expect(res.headers.get('x-request-id')).toBeNull();
  });

  it('adds request-id header when requestId is enabled', async () => {
    const { app } = createApp({
      ...minimalConfig,
      observability: { requestId: true },
    });
    const res = await app.request('/nonexistent');
    const requestId = res.headers.get('x-request-id');
    expect(requestId).not.toBeNull();
  });

  it('respects x-request-id from incoming request', async () => {
    const { app } = createApp({
      ...minimalConfig,
      observability: { requestId: true },
    });
    const res = await app.request('/nonexistent', {
      headers: { 'x-request-id': 'my-custom-id' },
    });
    expect(res.headers.get('x-request-id')).toBe('my-custom-id');
  });

  it('registers rate limit middleware when configured', async () => {
    const { app, rateLimitDispose } = createApp({
      ...minimalConfig,
      security: { rateLimit: { maxRequests: 2, windowMs: 60_000 } },
    });
    expect(rateLimitDispose).toBeDefined();
    rateLimitDispose?.();

    const res1 = await app.request('/nonexistent');
    expect(res1.status).toBe(404);

    const res2 = await app.request('/nonexistent');
    expect(res2.status).toBe(404);

    const res3 = await app.request('/nonexistent');
    expect(res3.status).toBe(429);
  });

  it('does not register rate limit middleware when not configured', async () => {
    const { app, rateLimitDispose } = createApp(minimalConfig);
    expect(rateLimitDispose).toBeUndefined();

    for (let i = 0; i < 110; i++) {
      const res = await app.request('/nonexistent');
      expect(res.status).not.toBe(429);
    }
  });

  it('uses custom logger from observability config', async () => {
    const logger = {
      debug: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    };
    createApp({
      ...minimalConfig,
      observability: { logger },
    });
    expect(logger.info).not.toThrow();
  });

  it('registers API routes and handles requests', async () => {
    const { app } = createApp({
      ...minimalConfig,
      apiRoutes: [
        {
          access: 'public',
          handler: async () => ({ message: 'hello' }),
          path: '/hello',
          type: 'api',
        },
      ],
    });
    const res = await app.request('/hello');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ message: 'hello' });
  });

  it('returns 404 for API-prefixed paths in SPA fallback', async () => {
    const { app } = createApp(minimalConfig);
    const res = await app.request('/api/unknown');
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ error: 'Not Found' });
  });

  it('uses custom apiPrefix for SPA fallback', async () => {
    const { app } = createApp({
      ...minimalConfig,
      app: { apiPrefix: '/v1', root: '/var/www' },
    });
    const res = await app.request('/v1/unknown');
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ error: 'Not Found' });
  });

  it('returns 500 JSON for unhandled errors via error handler', async () => {
    const { app } = createApp({
      ...minimalConfig,
      apiRoutes: [
        {
          access: 'public',
          handler: async () => {
            throw new Error('boom');
          },
          path: '/fail',
          type: 'api',
        },
      ],
    });
    const res = await app.request('/fail');
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: 'Internal Server Error' });
  });

  it('logs errors through the custom logger', async () => {
    const logger = {
      debug: (_scope: unknown) => {},
      error: vi.fn(),
      info: (_scope: unknown) => {},
      warn: (_scope: unknown) => {},
    };
    const { app } = createApp({
      ...minimalConfig,
      apiRoutes: [
        {
          access: 'public',
          handler: async () => {
            throw new Error('boom');
          },
          path: '/fail',
          type: 'api',
        },
      ],
      observability: {
        logger,
        onResponse: (_ctx: unknown, _claims: unknown, { error }: { error?: Error }) => {
          if (error) {
            logger.error(_ctx, `Request failed: ${error.message}`);
          }
        },
      },
    });
    await app.request('/fail');
    expect(logger.error).toHaveBeenCalled();
  });

  it('does not enable OpenAPI routes by default', async () => {
    const { app } = createApp(minimalConfig);
    const res = await app.request('/swagger');
    expect(res.status).toBe(404);
  });

  it('enables OpenAPI routes when openapi.enabled is true', async () => {
    const { app } = createApp({
      ...minimalConfig,
      apiRoutes: [
        {
          access: 'public',
          handler: async () => ({ ok: true }),
          method: 'get',
          path: '/api/test',
          type: 'api',
        },
      ],
      openapi: { enabled: true },
    });
    const swaggerRes = await app.request('/swagger');
    expect(swaggerRes.status).toBe(200);
    const swaggerCsp = swaggerRes.headers.get('Content-Security-Policy') ?? '';
    expect(swaggerCsp).toContain('https://cdn.jsdelivr.net');

    const apiRes = await app.request('/api/test');
    const apiCsp = apiRes.headers.get('Content-Security-Policy') ?? '';
    expect(apiCsp).not.toContain('https://cdn.jsdelivr.net');
  });

  it('uses custom OpenAPI path', async () => {
    const { app } = createApp({
      ...minimalConfig,
      openapi: { enabled: true, path: '/docs' },
    });
    const res = await app.request('/docs');
    expect(res.status).toBe(200);
  });

  it('logs an error when async secret resolves to empty string', async () => {
    const logger = {
      debug: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    };
    createApp({
      ...minimalConfig,
      observability: { logger },
      security: { auth: { secret: async () => '', strategy: 'bearer' } },
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(logger.error).toHaveBeenCalled();
    const errorCall = logger.error.mock.calls[0]!;
    expect(errorCall[1]).toContain('Async auth secret validation failed at startup');
  });

  it('logs an error when async secret rejects', async () => {
    const logger = {
      debug: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    };
    createApp({
      ...minimalConfig,
      observability: { logger },
      security: {
        auth: {
          secret: async () => {
            throw new Error('vault error');
          },
          strategy: 'bearer',
        },
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(logger.error).toHaveBeenCalled();
    const errorCall = logger.error.mock.calls[0]!;
    expect(errorCall[1]).toContain('Async auth secret validation failed at startup');
  });

  it('does not log when async secret resolves to a valid value', async () => {
    const logger = {
      debug: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    };
    createApp({
      ...minimalConfig,
      observability: { logger },
      security: { auth: { secret: async () => 'valid-secret', strategy: 'bearer' } },
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('provides scoped logger when logScopeFactory is configured', async () => {
    const infoFn = vi.fn();
    const logger = {
      debug: (_scope: unknown) => {},
      error: (_scope: unknown) => {},
      info: infoFn,
      warn: (_scope: unknown) => {},
    };
    const { app } = createApp({
      ...minimalConfig,
      apiRoutes: [
        {
          access: 'public',
          handler: async (
            _ctx: unknown,
            appCtx: {
              claims: unknown;
              logger: { info: (...args: unknown[]) => void };
            },
          ) => {
            (appCtx.logger.info as (...args: unknown[]) => void)(
              { ignored: true },
              'handler message',
            );
            return { ok: true };
          },
          path: '/scoped',
          type: 'api',
        },
      ],
      observability: {
        logger,
        logScopeFactory: (ctx: import('../types/app').RequestContext, _claims: unknown) => ({
          requestId: ctx.path,
        }),
      },
    });
    await app.request('/scoped');
    expect(infoFn).toHaveBeenCalled();
    const call = infoFn.mock.calls[0]!;
    expect(call[0]).toEqual({ requestId: '/scoped' });
    expect(call[1]).toBe('handler message');
  });
});
