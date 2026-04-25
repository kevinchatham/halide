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
  it('throws on invalid config', () => {
    expect(() => createApp({} as never)).toThrow('spa.root is required');
  });

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
      security: { csp: { directives: { defaultSrc: ["'none'"], scriptSrc: ["'none'"] } } },
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
      spa: { apiPrefix: '/v1', root: '/var/www' },
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
      debug: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
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
      observability: { logger },
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
    expect(swaggerCsp).toContain("'unsafe-inline'");
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
});

describe('createServer', () => {
  it('returns a server object with start and stop methods', async () => {
    const server = createServer(minimalConfig);
    expect(typeof server.start).toBe('function');
    expect(typeof server.stop).toBe('function');
  });

  it('starts and stops without error', async () => {
    const server = createServer({
      ...minimalConfig,
      spa: { ...minimalConfig.spa, port: getFreePort() },
    });
    server.start();
    await server.stop();
  });

  it('logs startup with custom spa.name', async () => {
    const infoMessages: string[] = [];
    const server = createServer({
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
    server.start();
    await server.stop();
    expect(infoMessages.length).toBe(1);
    expect(infoMessages[0]).toContain('my-app');
  });

  it('logs startup with default spa.name', async () => {
    const infoMessages: string[] = [];
    const server = createServer({
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
    server.start();
    await server.stop();
    expect(infoMessages[0]).toContain('app');
  });

  it('resolves port from process.env.PORT', async () => {
    const originalPort = process.env.PORT;
    process.env.PORT = '48921';
    try {
      const infoMessages: string[] = [];
      const server = createServer({
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
      server.start();
      await server.stop();
      expect(infoMessages[0]).toContain('48921');
    } finally {
      if (originalPort === undefined) {
        delete process.env.PORT;
      } else {
        process.env.PORT = originalPort;
      }
    }
  });

  it('falls back to config port when PORT env is invalid', async () => {
    const originalPort = process.env.PORT;
    process.env.PORT = 'not-a-number';
    try {
      const infoMessages: string[] = [];
      const server = createServer({
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
      server.start();
      await server.stop();
      expect(infoMessages[0]).toContain('3999');
    } finally {
      if (originalPort === undefined) {
        delete process.env.PORT;
      } else {
        process.env.PORT = originalPort;
      }
    }
  });

  it('stop resolves gracefully when server was never started', async () => {
    const server = createServer(minimalConfig);
    await expect(server.stop()).resolves.toBeUndefined();
  });

  it('registers SIGINT and SIGTERM handlers after start', async () => {
    const onSpy = vi.spyOn(process, 'on').mockImplementation(() => process);
    const server = createServer({
      ...minimalConfig,
      spa: { ...minimalConfig.spa, port: getFreePort() },
    });
    server.start();
    await server.stop();
    expect(onSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));
    expect(onSpy).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
    onSpy.mockRestore();
  });

  it('does not register signal handlers before start', async () => {
    const onSpy = vi.spyOn(process, 'on').mockImplementation(() => process);
    const _server = createServer(minimalConfig);
    const sigintCalls = onSpy.mock.calls.filter((c) => c[0] === 'SIGINT');
    const sigtermCalls = onSpy.mock.calls.filter((c) => c[0] === 'SIGTERM');
    expect(sigintCalls.length).toBe(0);
    expect(sigtermCalls.length).toBe(0);
    onSpy.mockRestore();
  });

  it('prevents double shutdown when stop is called before signal', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    const server = createServer({
      ...minimalConfig,
      spa: { ...minimalConfig.spa, port: getFreePort() },
    });
    server.start();
    await server.stop();
    expect(exitSpy).not.toHaveBeenCalled();
    exitSpy.mockRestore();
  });

  it('calls onReady callback with port when server starts', async () => {
    const port = getFreePort();
    const server = createServer({
      ...minimalConfig,
      spa: { ...minimalConfig.spa, port },
    });
    let receivedPort: number | undefined;
    server.start((p) => {
      receivedPort = p;
    });
    await server.ready;
    await server.stop();
    expect(receivedPort).toBe(port);
  });

  it('logs shutdown message and exits on SIGTERM signal', async () => {
    const infoMessages: string[] = [];
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    const onSpy = vi.spyOn(process, 'on').mockImplementation(() => process);
    const port = getFreePort();
    const server = createServer({
      ...minimalConfig,
      observability: {
        logger: {
          debug: () => {},
          error: () => {},
          info: (...args: unknown[]) => infoMessages.push(args.join(' ')),
          warn: () => {},
        },
      },
      spa: { ...minimalConfig.spa, name: 'test-app', port },
    });
    server.start();
    const sigtermHandler = onSpy.mock.calls.find((c: unknown[]) => c[0] === 'SIGTERM')?.[1] as
      | (() => void)
      | undefined;
    if (sigtermHandler) {
      sigtermHandler();
    }
    await new Promise((resolve) => setImmediate(resolve));
    expect(infoMessages.some((msg) => msg.includes('SIGTERM'))).toBe(true);
    expect(exitSpy).toHaveBeenCalledWith(0);
    exitSpy.mockRestore();
    onSpy.mockRestore();
  });

  it('logs shutdown message and exits on SIGINT signal', async () => {
    const infoMessages: string[] = [];
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    const onSpy = vi.spyOn(process, 'on').mockImplementation(() => process);
    const port = getFreePort();
    const server = createServer({
      ...minimalConfig,
      observability: {
        logger: {
          debug: () => {},
          error: () => {},
          info: (...args: unknown[]) => infoMessages.push(args.join(' ')),
          warn: () => {},
        },
      },
      spa: { ...minimalConfig.spa, name: 'test-app', port },
    });
    server.start();
    const sigintHandler = onSpy.mock.calls.find((c: unknown[]) => c[0] === 'SIGINT')?.[1] as
      | (() => void)
      | undefined;
    if (sigintHandler) {
      sigintHandler();
    }
    await new Promise((resolve) => setImmediate(resolve));
    expect(infoMessages.some((msg) => msg.includes('SIGINT'))).toBe(true);
    expect(exitSpy).toHaveBeenCalledWith(0);
    exitSpy.mockRestore();
    onSpy.mockRestore();
  });
});
