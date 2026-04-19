import net from 'node:net';
import { createApp, createServer } from './runtime';

function getFreePort(): number {
  const server = net.createServer();
  server.listen(0);
  const address = server.address() as net.AddressInfo;
  const port = address.port;
  server.close();
  return port;
}

const minimalConfig = { spa: { root: '/var/www' } } as const;

describe('createApp', () => {
  it('throws on invalid config', async () => {
    await expect(createApp({} as never)).rejects.toThrow('spa.root is required');
  });

  it('returns an app and rateLimitDispose', async () => {
    const result = await createApp(minimalConfig);
    expect(result.app).toBeDefined();
    expect(result.rateLimitDispose).toBeUndefined();
  });

  it('applies CORS with default allow-methods on preflight', async () => {
    const { app } = await createApp(minimalConfig);
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
    const { app } = await createApp({
      ...minimalConfig,
      security: { cors: { origin: ['http://localhost:3000'] } },
    });
    const res = await app.request('/nonexistent', {
      headers: { origin: 'http://localhost:3000' },
    });
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:3000');
  });

  it('applies CORS with custom methods', async () => {
    const { app } = await createApp({
      ...minimalConfig,
      security: { cors: { methods: ['get', 'post'] } },
    });
    const res = await app.request('/nonexistent', { method: 'OPTIONS' });
    const allowMethods = res.headers.get('access-control-allow-methods') ?? '';
    expect(allowMethods).toContain('GET');
    expect(allowMethods).toContain('POST');
  });

  it('applies CORS credentials from config', async () => {
    const { app } = await createApp({
      ...minimalConfig,
      security: {
        auth: { secret: () => 'secret', strategy: 'bearer' },
        cors: { credentials: true, origin: ['http://localhost:3000'] },
      },
    });
    const res = await app.request('/nonexistent', {
      headers: { origin: 'http://localhost:3000' },
    });
    expect(res.headers.get('access-control-allow-credentials')).toBe('true');
  });

  it('applies default CORS credentials as false', async () => {
    const { app } = await createApp(minimalConfig);
    const res = await app.request('/nonexistent');
    expect(res.headers.get('access-control-allow-credentials')).toBeNull();
  });

  it('applies security headers with default CSP', async () => {
    const { app } = await createApp(minimalConfig);
    const res = await app.request('/nonexistent');
    const csp = res.headers.get('Content-Security-Policy');
    expect(csp).toContain("'self'");
  });

  it('applies custom CSP directives', async () => {
    const { app } = await createApp({
      ...minimalConfig,
      security: { csp: { directives: { defaultSrc: ["'none'"], scriptSrc: ["'none'"] } } },
    });
    const res = await app.request('/nonexistent');
    const csp = res.headers.get('Content-Security-Policy') ?? '';
    expect(csp).toContain("'none'");
  });

  it('does not add request-id header when requestId is not configured', async () => {
    const { app } = await createApp(minimalConfig);
    const res = await app.request('/nonexistent');
    expect(res.headers.get('x-request-id')).toBeNull();
  });

  it('adds request-id header when requestId is enabled', async () => {
    const { app } = await createApp({
      ...minimalConfig,
      observability: { requestId: true },
    });
    const res = await app.request('/nonexistent');
    const requestId = res.headers.get('x-request-id');
    expect(requestId).not.toBeNull();
  });

  it('respects x-request-id from incoming request', async () => {
    const { app } = await createApp({
      ...minimalConfig,
      observability: { requestId: true },
    });
    const res = await app.request('/nonexistent', {
      headers: { 'x-request-id': 'my-custom-id' },
    });
    expect(res.headers.get('x-request-id')).toBe('my-custom-id');
  });

  it('registers rate limit middleware when configured', async () => {
    const { app, rateLimitDispose } = await createApp({
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
    const { app, rateLimitDispose } = await createApp(minimalConfig);
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
    await createApp({
      ...minimalConfig,
      observability: { logger },
    });
    expect(logger.info).not.toThrow();
  });

  it('registers API routes and handles requests', async () => {
    const { app } = await createApp({
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
    const { app } = await createApp(minimalConfig);
    const res = await app.request('/api/unknown');
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ error: 'Not Found' });
  });

  it('uses custom apiPrefix for SPA fallback', async () => {
    const { app } = await createApp({
      ...minimalConfig,
      spa: { apiPrefix: '/v1', root: '/var/www' },
    });
    const res = await app.request('/v1/unknown');
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ error: 'Not Found' });
  });

  it('returns 500 JSON for unhandled errors via error handler', async () => {
    const { app } = await createApp({
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
      debug: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    };
    const { app } = await createApp({
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
      observability: { logger },
    });
    await app.request('/fail');
    expect(logger.error).toHaveBeenCalled();
  });

  it('does not enable OpenAPI routes by default', async () => {
    const { app } = await createApp(minimalConfig);
    const res = await app.request('/swagger');
    expect(res.status).toBe(404);
  });

  it('enables OpenAPI routes when openapi.enabled is true', async () => {
    const { app } = await createApp({
      ...minimalConfig,
      openapi: { enabled: true },
    });
    const res = await app.request('/swagger');
    expect(res.status).toBe(200);
  });

  it('uses custom OpenAPI path', async () => {
    const { app } = await createApp({
      ...minimalConfig,
      openapi: { enabled: true, path: '/docs' },
    });
    const res = await app.request('/docs');
    expect(res.status).toBe(200);
  });
});

describe('createServer', () => {
  it('returns a server object with start and stop methods', async () => {
    const server = await createServer(minimalConfig);
    expect(typeof server.start).toBe('function');
    expect(typeof server.stop).toBe('function');
  });

  it('starts and stops without error', async () => {
    const server = await createServer({
      ...minimalConfig,
      spa: { ...minimalConfig.spa, port: getFreePort() },
    });
    await server.start();
    await server.stop();
  });

  it('logs startup with custom spa.name', async () => {
    const infoMessages: string[] = [];
    const server = await createServer({
      ...minimalConfig,
      observability: {
        logger: {
          debug: () => {},
          error: () => {},
          info: (...args: unknown[]) => infoMessages.push(args.join(' ')),
          warn: () => {},
        },
      },
      spa: { ...minimalConfig.spa, name: 'my-app', port: getFreePort() },
    });
    await server.start();
    await server.stop();
    expect(infoMessages.length).toBe(1);
    expect(infoMessages[0]).toContain('my-app');
  });

  it('logs startup with default spa.name', async () => {
    const infoMessages: string[] = [];
    const server = await createServer({
      ...minimalConfig,
      observability: {
        logger: {
          debug: () => {},
          error: () => {},
          info: (...args: unknown[]) => infoMessages.push(args.join(' ')),
          warn: () => {},
        },
      },
      spa: { ...minimalConfig.spa, port: getFreePort() },
    });
    await server.start();
    await server.stop();
    expect(infoMessages[0]).toContain('app');
  });

  it('resolves port from process.env.PORT', async () => {
    const originalPort = process.env.PORT;
    process.env.PORT = '48921';
    try {
      const infoMessages: string[] = [];
      const server = await createServer({
        ...minimalConfig,
        observability: {
          logger: {
            debug: () => {},
            error: () => {},
            info: (...args: unknown[]) => infoMessages.push(args.join(' ')),
            warn: () => {},
          },
        },
      });
      await server.start();
      await server.stop();
      expect(infoMessages[0]).toContain('48921');
    } finally {
      if (originalPort !== undefined) {
        process.env.PORT = originalPort;
      } else {
        delete process.env.PORT;
      }
    }
  });

  it('falls back to config port when PORT env is invalid', async () => {
    const originalPort = process.env.PORT;
    process.env.PORT = 'not-a-number';
    try {
      const infoMessages: string[] = [];
      const server = await createServer({
        ...minimalConfig,
        observability: {
          logger: {
            debug: () => {},
            error: () => {},
            info: (...args: unknown[]) => infoMessages.push(args.join(' ')),
            warn: () => {},
          },
        },
        spa: { ...minimalConfig.spa, port: 3999 },
      });
      await server.start();
      await server.stop();
      expect(infoMessages[0]).toContain('3999');
    } finally {
      if (originalPort !== undefined) {
        process.env.PORT = originalPort;
      } else {
        delete process.env.PORT;
      }
    }
  });

  it('stop resolves gracefully when server was never started', async () => {
    const server = await createServer(minimalConfig);
    await expect(server.stop()).resolves.toBeUndefined();
  });
});
