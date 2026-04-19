import type { Express, RequestHandler, Router } from 'express';
import { createNoopLogger } from '../config/defaults';
import type { Logger, ServerConfig } from '../config/types';
import { createAuthMiddleware, createJwksAuthMiddleware } from '../middleware/auth';
import { createProxyService } from '../services/proxy';
import { registerRoutes } from './registry';

vi.mock('../middleware/auth', () => ({
  createAuthMiddleware: vi.fn(),
  createJwksAuthMiddleware: vi.fn(),
}));

vi.mock('../services/proxy', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/proxy')>();
  return {
    buildRequestContextFromExpress: actual.buildRequestContextFromExpress,
    createProxyService: vi.fn(),
    serializeQueryParam: actual.serializeQueryParam,
  };
});

const noopLogger: Logger = createNoopLogger();

describe('registerRoutes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does nothing when routes is missing', async () => {
    const app = { get: vi.fn() } as unknown as Express | Router;
    const config = {
      security: { auth: { secret: 'secret', strategy: 'bearer' } },
      spa: { root: '/var/www' },
    } as unknown as ServerConfig;

    await registerRoutes(app, config, noopLogger);

    expect(app.get).not.toHaveBeenCalled();
  });

  it('registers public proxy routes without auth middleware', async () => {
    const app = {
      delete: vi.fn(),
      get: vi.fn(),
      patch: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
    } as unknown as Express | Router;
    const mockProxyHandler = vi.fn();
    vi.mocked(createProxyService).mockReturnValue(mockProxyHandler as unknown as RequestHandler);

    const config = {
      proxyRoutes: [
        {
          access: 'public',
          methods: ['get', 'post', 'put', 'patch', 'delete'],
          path: '/users',
          proxyPath: '/api/users',
          target: 'https://api.example.com',
          type: 'proxy',
        },
      ],
      security: { auth: { secret: 'secret', strategy: 'bearer' } },
      spa: { root: '/var/www' },
    } as unknown as ServerConfig;

    await registerRoutes(app, config, noopLogger);

    expect(app.get).toHaveBeenCalledWith('/users', mockProxyHandler);
    expect(app.post).toHaveBeenCalledWith('/users', mockProxyHandler);
    expect(app.put).toHaveBeenCalledWith('/users', mockProxyHandler);
    expect(app.patch).toHaveBeenCalledWith('/users', mockProxyHandler);
    expect(app.delete).toHaveBeenCalledWith('/users', mockProxyHandler);
  });

  it('registers private proxy routes with auth middleware', async () => {
    const app = {
      delete: vi.fn(),
      get: vi.fn(),
      patch: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
    } as unknown as Express | Router;
    const mockProxyHandler = vi.fn();
    const mockAuthMiddleware = vi.fn();
    vi.mocked(createProxyService).mockReturnValue(mockProxyHandler as unknown as RequestHandler);
    vi.mocked(createAuthMiddleware).mockReturnValue(
      mockAuthMiddleware as unknown as RequestHandler,
    );

    const config = {
      proxyRoutes: [
        {
          access: 'private',
          methods: ['get', 'post', 'put', 'patch', 'delete'],
          path: '/admin',
          proxyPath: '/api/admin',
          target: 'https://api.example.com',
          type: 'proxy',
        },
      ],
      security: { auth: { secret: 'secret', strategy: 'bearer' } },
      spa: { root: '/var/www' },
    } as unknown as ServerConfig;

    await registerRoutes(app, config, noopLogger);

    expect(app.get).toHaveBeenCalledWith('/admin', mockAuthMiddleware, mockProxyHandler);
    expect(app.post).toHaveBeenCalledWith('/admin', mockAuthMiddleware, mockProxyHandler);
    expect(app.put).toHaveBeenCalledWith('/admin', mockAuthMiddleware, mockProxyHandler);
    expect(app.patch).toHaveBeenCalledWith('/admin', mockAuthMiddleware, mockProxyHandler);
    expect(app.delete).toHaveBeenCalledWith('/admin', mockAuthMiddleware, mockProxyHandler);
  });

  it('registers multiple proxy routes', async () => {
    const app = {
      delete: vi.fn(),
      get: vi.fn(),
      patch: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
    } as unknown as Express | Router;
    const mockProxyHandler = vi.fn();
    vi.mocked(createProxyService).mockReturnValue(mockProxyHandler as unknown as RequestHandler);

    const config = {
      proxyRoutes: [
        {
          access: 'public',
          methods: ['get', 'post', 'put', 'patch', 'delete'],
          path: '/users',
          proxyPath: '/users',
          target: 'https://api1.example.com',
          type: 'proxy',
        },
        {
          access: 'public',
          methods: ['get', 'post', 'put', 'patch', 'delete'],
          path: '/orders',
          proxyPath: '/orders',
          target: 'https://api2.example.com',
          type: 'proxy',
        },
      ],
      security: { auth: { secret: 'secret', strategy: 'bearer' } },
      spa: { root: '/var/www' },
    } as unknown as ServerConfig;

    await registerRoutes(app, config, noopLogger);

    expect(app.get).toHaveBeenCalledWith('/users', mockProxyHandler);
    expect(app.get).toHaveBeenCalledWith('/orders', mockProxyHandler);
    expect(app.get).toHaveBeenCalledTimes(2);
    expect(app.post).toHaveBeenCalledTimes(2);
    expect(app.put).toHaveBeenCalledTimes(2);
    expect(app.patch).toHaveBeenCalledTimes(2);
    expect(app.delete).toHaveBeenCalledTimes(2);
  });

  it('uses JWKS middleware when strategy is jwks', async () => {
    const app = {
      delete: vi.fn(),
      get: vi.fn(),
      patch: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
    } as unknown as Express | Router;
    const mockProxyHandler = vi.fn();
    const mockJwksMiddleware = vi.fn();
    vi.mocked(createProxyService).mockReturnValue(mockProxyHandler as unknown as RequestHandler);
    vi.mocked(createJwksAuthMiddleware).mockReturnValue(
      mockJwksMiddleware as unknown as RequestHandler,
    );

    const config = {
      proxyRoutes: [
        {
          access: 'private',
          methods: ['get', 'post', 'put', 'patch', 'delete'],
          path: '/admin',
          proxyPath: '/admin',
          target: 'https://api.example.com',
          type: 'proxy',
        },
      ],
      security: {
        auth: {
          jwksUri: 'https://auth.example.com/.well-known/jwks.json',
          strategy: 'jwks',
        },
      },
      spa: { root: '/var/www' },
    } as unknown as ServerConfig;

    await registerRoutes(app, config, noopLogger);

    expect(createJwksAuthMiddleware).toHaveBeenCalledWith(
      'https://auth.example.com/.well-known/jwks.json',
      undefined,
    );
    expect(app.get).toHaveBeenCalledWith('/admin', mockJwksMiddleware, mockProxyHandler);
    expect(app.post).toHaveBeenCalledWith('/admin', mockJwksMiddleware, mockProxyHandler);
    expect(app.put).toHaveBeenCalledWith('/admin', mockJwksMiddleware, mockProxyHandler);
    expect(app.patch).toHaveBeenCalledWith('/admin', mockJwksMiddleware, mockProxyHandler);
    expect(app.delete).toHaveBeenCalledWith('/admin', mockJwksMiddleware, mockProxyHandler);
  });

  it('registers public api routes without auth middleware', async () => {
    const app = { get: vi.fn() } as unknown as Express | Router;
    const mockHandler = vi.fn();

    const config = {
      apiRoutes: [
        {
          access: 'public',
          handler: mockHandler,
          path: '/health',
          type: 'api',
        },
      ],
      security: { auth: { secret: 'secret', strategy: 'bearer' } },
      spa: { root: '/var/www' },
    } as unknown as ServerConfig;

    await registerRoutes(app, config, noopLogger);

    expect(app.get).toHaveBeenCalledTimes(1);
    expect(app.get).toHaveBeenCalledWith('/health', expect.any(Function));
  });

  it('registers private api routes with auth middleware', async () => {
    const app = { get: vi.fn() } as unknown as Express | Router;
    const mockHandler = vi.fn();
    const mockAuthMiddleware = vi.fn();
    vi.mocked(createAuthMiddleware).mockReturnValue(
      mockAuthMiddleware as unknown as RequestHandler,
    );

    const config = {
      apiRoutes: [
        {
          access: 'private',
          handler: mockHandler,
          path: '/profile',
          type: 'api',
        },
      ],
      security: { auth: { secret: 'secret', strategy: 'bearer' } },
      spa: { root: '/var/www' },
    } as unknown as ServerConfig;

    await registerRoutes(app, config, noopLogger);

    expect(app.get).toHaveBeenCalledTimes(1);
    expect(app.get).toHaveBeenCalledWith('/profile', mockAuthMiddleware, expect.any(Function));
  });

  it('registers multiple api routes', async () => {
    const app = { get: vi.fn() } as unknown as Express | Router;
    const mockHandler1 = vi.fn();
    const mockHandler2 = vi.fn();
    const mockAuthMiddleware = vi.fn();
    vi.mocked(createAuthMiddleware).mockReturnValue(
      mockAuthMiddleware as unknown as RequestHandler,
    );

    const config = {
      apiRoutes: [
        {
          access: 'public',
          handler: mockHandler1,
          path: '/public',
          type: 'api',
        },
        {
          access: 'private',
          handler: mockHandler2,
          path: '/private',
          type: 'api',
        },
      ],
      security: { auth: { secret: 'secret', strategy: 'bearer' } },
      spa: { root: '/var/www' },
    } as unknown as ServerConfig;

    await registerRoutes(app, config, noopLogger);

    expect(app.get).toHaveBeenCalledTimes(2);
    expect(app.get).toHaveBeenCalledWith('/public', expect.any(Function));
    expect(app.get).toHaveBeenCalledWith('/private', mockAuthMiddleware, expect.any(Function));
  });

  it('registers POST routes when method is post', async () => {
    const app = { get: vi.fn(), post: vi.fn() } as unknown as Express | Router;
    const mockHandler = vi.fn();
    const mockAuthMiddleware = vi.fn();
    vi.mocked(createAuthMiddleware).mockReturnValue(
      mockAuthMiddleware as unknown as RequestHandler,
    );

    const config = {
      apiRoutes: [
        {
          access: 'public',
          handler: mockHandler,
          method: 'post',
          path: '/create',
          type: 'api',
        },
        {
          access: 'private',
          handler: mockHandler,
          method: 'post',
          path: '/update',
          type: 'api',
        },
      ],
      security: { auth: { secret: 'secret', strategy: 'bearer' } },
      spa: { root: '/var/www' },
    } as unknown as ServerConfig;

    await registerRoutes(app, config, noopLogger);

    expect(app.post).toHaveBeenCalledTimes(2);
    expect(app.post).toHaveBeenCalledWith('/create', expect.any(Function));
    expect(app.post).toHaveBeenCalledWith('/update', mockAuthMiddleware, expect.any(Function));
    expect(app.get).not.toHaveBeenCalled();
  });

  it('registers PUT routes when method is put', async () => {
    const app = { get: vi.fn(), put: vi.fn() } as unknown as Express | Router;
    const mockHandler = vi.fn();

    const config = {
      apiRoutes: [
        {
          access: 'public',
          handler: mockHandler,
          method: 'put',
          path: '/update/:id',
          type: 'api',
        },
      ],
      security: { auth: { secret: 'secret', strategy: 'bearer' } },
      spa: { root: '/var/www' },
    } as unknown as ServerConfig;

    await registerRoutes(app, config, noopLogger);

    expect(app.put).toHaveBeenCalledWith('/update/:id', expect.any(Function));
  });

  it('registers DELETE routes when method is delete', async () => {
    const app = { delete: vi.fn() } as unknown as Express | Router;
    const mockHandler = vi.fn();
    const mockAuthMiddleware = vi.fn();
    vi.mocked(createAuthMiddleware).mockReturnValue(
      mockAuthMiddleware as unknown as RequestHandler,
    );

    const config = {
      apiRoutes: [
        {
          access: 'private',
          handler: mockHandler,
          method: 'delete',
          path: '/delete/:id',
          type: 'api',
        },
      ],
      security: { auth: { secret: 'secret', strategy: 'bearer' } },
      spa: { root: '/var/www' },
    } as unknown as ServerConfig;

    await registerRoutes(app, config, noopLogger);

    expect(app.delete).toHaveBeenCalledWith(
      '/delete/:id',
      mockAuthMiddleware,
      expect.any(Function),
    );
  });

  it('defaults to GET when method is not specified', async () => {
    const app = { get: vi.fn() } as unknown as Express | Router;
    const mockHandler = vi.fn();

    const config = {
      apiRoutes: [{ access: 'public', handler: mockHandler, path: '/data', type: 'api' }],
      security: { auth: { secret: 'secret', strategy: 'bearer' } },
      spa: { root: '/var/www' },
    } as unknown as ServerConfig;

    await registerRoutes(app, config, noopLogger);

    expect(app.get).toHaveBeenCalledWith('/data', expect.any(Function));
  });

  it('uses JWKS middleware for api routes when strategy is jwks', async () => {
    const app = { get: vi.fn() } as unknown as Express | Router;
    const mockHandler = vi.fn();
    const mockJwksMiddleware = vi.fn();
    vi.mocked(createJwksAuthMiddleware).mockReturnValue(
      mockJwksMiddleware as unknown as RequestHandler,
    );

    const config = {
      apiRoutes: [
        {
          access: 'private',
          handler: mockHandler,
          path: '/profile',
          type: 'api',
        },
      ],
      security: {
        auth: {
          jwksUri: 'https://auth.example.com/.well-known/jwks.json',
          strategy: 'jwks',
        },
      },
      spa: { root: '/var/www' },
    } as unknown as ServerConfig;

    await registerRoutes(app, config, noopLogger);

    expect(createJwksAuthMiddleware).toHaveBeenCalledWith(
      'https://auth.example.com/.well-known/jwks.json',
      undefined,
    );
    expect(app.get).toHaveBeenCalledWith('/profile', mockJwksMiddleware, expect.any(Function));
  });

  it('passes identity function and logger to createProxyService', async () => {
    const app = {
      delete: vi.fn(),
      get: vi.fn(),
      patch: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
    } as unknown as Express | Router;
    const mockProxyHandler = vi.fn();
    vi.mocked(createProxyService).mockReturnValue(mockProxyHandler as unknown as RequestHandler);

    const identityFn = (_ctx: unknown, claims: unknown): Record<string, string> | undefined => ({
      'x-user-id': (claims as { sub: string }).sub,
    });

    const config = {
      proxyRoutes: [
        {
          access: 'private',
          identity: identityFn,
          methods: ['get', 'post', 'put', 'patch', 'delete'],
          path: '/users',
          proxyPath: '/api/users',
          target: 'https://api.example.com',
          type: 'proxy',
        },
      ],
      security: { auth: { secret: 'secret', strategy: 'bearer' } },
      spa: { root: '/var/www' },
    } as unknown as ServerConfig;

    await registerRoutes(app, config, noopLogger);

    expect(createProxyService).toHaveBeenCalledWith(
      'https://api.example.com',
      '/users',
      '/api/users',
      identityFn,
      undefined,
      undefined,
      noopLogger,
    );
  });

  it('executes api handler and returns result', async () => {
    const app = { get: vi.fn() } as unknown as Express | Router;
    const mockHandler = vi.fn().mockResolvedValue({ id: 1, name: 'test' });

    const config = {
      apiRoutes: [
        {
          access: 'public',
          handler: mockHandler,
          path: '/items',
          type: 'api',
        },
      ],
      spa: { root: '/var/www' },
    } as unknown as ServerConfig;

    await registerRoutes(app, config, noopLogger);

    const getCall = (app.get as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const handler = getCall[1] as RequestHandler;

    const req = {
      body: {},
      headers: {},
      method: 'GET',
      params: {},
      path: '/items',
      query: {},
    } as unknown as import('express').Request;
    const res = { json: vi.fn() } as unknown as import('express').Response;
    const next = vi.fn();

    await handler(req, res, next);

    expect(mockHandler).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ id: 1, name: 'test' });
  });

  it('calls next with error when api handler throws', async () => {
    const app = { get: vi.fn() } as unknown as Express | Router;
    const testError = new Error('Handler failed');
    const mockHandler = vi.fn().mockRejectedValue(testError);

    const config = {
      apiRoutes: [
        {
          access: 'public',
          handler: mockHandler,
          path: '/items',
          type: 'api',
        },
      ],
      spa: { root: '/var/www' },
    } as unknown as ServerConfig;

    await registerRoutes(app, config, noopLogger);

    const getCall = (app.get as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const handler = getCall[1] as RequestHandler;

    const req = {
      body: {},
      headers: {},
      method: 'GET',
      params: {},
      path: '/items',
      query: {},
    } as unknown as import('express').Request;
    const res = { json: vi.fn() } as unknown as import('express').Response;
    const next = vi.fn();

    await handler(req, res, next);

    expect(next).toHaveBeenCalledWith(testError);
  });

  it('skips observability when route observe is false', async () => {
    const app = { get: vi.fn() } as unknown as Express | Router;
    const mockHandler = vi.fn().mockResolvedValue({ ok: true });
    const onRequest = vi.fn();

    const config = {
      apiRoutes: [
        {
          access: 'public',
          handler: mockHandler,
          observe: false,
          path: '/items',
          type: 'api',
        },
      ],
      observability: { onRequest },
      spa: { root: '/var/www' },
    } as unknown as ServerConfig;

    await registerRoutes(app, config, noopLogger);

    const getCall = (app.get as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const middlewares = getCall.slice(1) as RequestHandler[];
    expect(middlewares.length).toBe(1);
  });

  it('registers routes with validation schema', async () => {
    const app = { post: vi.fn() } as unknown as Express | Router;
    const mockHandler = vi.fn().mockResolvedValue({ created: true });
    const { z } = await import('zod');

    const config = {
      apiRoutes: [
        {
          access: 'public',
          handler: mockHandler,
          method: 'post',
          path: '/items',
          type: 'api',
          validationSchema: z.object({ name: z.string() }),
        },
      ],
      spa: { root: '/var/www' },
    } as unknown as ServerConfig;

    await registerRoutes(app, config, noopLogger);

    expect(app.post).toHaveBeenCalledTimes(1);
    const postCall = (app.post as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(postCall.length).toBeGreaterThan(2);
  });

  it('registers proxy routes with transform function', async () => {
    const app = { get: vi.fn() } as unknown as Express | Router;
    const mockProxyHandler = vi.fn();
    vi.mocked(createProxyService).mockReturnValue(mockProxyHandler as unknown as RequestHandler);

    const transformFn = vi.fn().mockReturnValue({ body: {}, headers: {} });

    const config = {
      proxyRoutes: [
        {
          access: 'public',
          methods: ['get'],
          path: '/api',
          proxyPath: '/api',
          target: 'https://api.example.com',
          transform: transformFn,
          type: 'proxy',
        },
      ],
      spa: { root: '/var/www' },
    } as unknown as ServerConfig;

    await registerRoutes(app, config, noopLogger);

    expect(createProxyService).toHaveBeenCalledWith(
      'https://api.example.com',
      '/api',
      '/api',
      undefined,
      transformFn,
      undefined,
      noopLogger,
    );
  });

  it('registers proxy routes with timeout', async () => {
    const app = { get: vi.fn() } as unknown as Express | Router;
    const mockProxyHandler = vi.fn();
    vi.mocked(createProxyService).mockReturnValue(mockProxyHandler as unknown as RequestHandler);

    const config = {
      proxyRoutes: [
        {
          access: 'public',
          methods: ['get'],
          path: '/api',
          proxyPath: '/api',
          target: 'https://api.example.com',
          timeout: 5000,
          type: 'proxy',
        },
      ],
      spa: { root: '/var/www' },
    } as unknown as ServerConfig;

    await registerRoutes(app, config, noopLogger);

    expect(createProxyService).toHaveBeenCalledWith(
      'https://api.example.com',
      '/api',
      '/api',
      undefined,
      undefined,
      5000,
      noopLogger,
    );
  });

  it('executes authorize middleware and denies forbidden request', async () => {
    const app = { get: vi.fn() } as unknown as Express | Router;
    const mockHandler = vi.fn().mockResolvedValue({ ok: true });
    const authorizeFn = vi.fn().mockResolvedValue(false);

    const config = {
      apiRoutes: [
        {
          access: 'public',
          authorize: authorizeFn,
          handler: mockHandler,
          path: '/items',
          type: 'api',
        },
      ],
      spa: { root: '/var/www' },
    } as unknown as ServerConfig;

    await registerRoutes(app, config, noopLogger);

    const getCall = (app.get as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const middlewares = getCall.slice(1) as RequestHandler[];
    const authorizeMiddleware = middlewares[0]!;

    const req = {
      body: {},
      headers: {},
      method: 'GET',
      params: {},
      path: '/items',
      query: {},
    } as unknown as import('express').Request;
    const res = {
      json: vi.fn().mockReturnThis(),
      status: vi.fn().mockReturnThis(),
    } as unknown as import('express').Response;
    const next = vi.fn();

    await authorizeMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Forbidden' });
    expect(next).not.toHaveBeenCalled();
  });

  it('executes authorize middleware and allows authorized request', async () => {
    const app = { get: vi.fn() } as unknown as Express | Router;
    const mockHandler = vi.fn().mockResolvedValue({ ok: true });
    const authorizeFn = vi.fn().mockResolvedValue(true);

    const config = {
      apiRoutes: [
        {
          access: 'public',
          authorize: authorizeFn,
          handler: mockHandler,
          path: '/items',
          type: 'api',
        },
      ],
      spa: { root: '/var/www' },
    } as unknown as ServerConfig;

    await registerRoutes(app, config, noopLogger);

    const getCall = (app.get as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const middlewares = getCall.slice(1) as RequestHandler[];
    const authorizeMiddleware = middlewares[0]!;

    const req = {
      body: {},
      headers: {},
      method: 'GET',
      params: {},
      path: '/items',
      query: {},
    } as unknown as import('express').Request;
    const res = {
      json: vi.fn().mockReturnThis(),
      status: vi.fn().mockReturnThis(),
    } as unknown as import('express').Response;
    const next = vi.fn();

    await authorizeMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('returns 403 when authorize middleware throws', async () => {
    const app = { get: vi.fn() } as unknown as Express | Router;
    const mockHandler = vi.fn().mockResolvedValue({ ok: true });
    const authorizeFn = vi.fn().mockRejectedValue(new Error('Auth error'));

    const config = {
      apiRoutes: [
        {
          access: 'public',
          authorize: authorizeFn,
          handler: mockHandler,
          path: '/items',
          type: 'api',
        },
      ],
      spa: { root: '/var/www' },
    } as unknown as ServerConfig;

    await registerRoutes(app, config, noopLogger);

    const getCall = (app.get as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const middlewares = getCall.slice(1) as RequestHandler[];
    const authorizeMiddleware = middlewares[0]!;

    const req = {
      body: {},
      headers: {},
      method: 'GET',
      params: {},
      path: '/items',
      query: {},
    } as unknown as import('express').Request;
    const res = {
      json: vi.fn().mockReturnThis(),
      status: vi.fn().mockReturnThis(),
    } as unknown as import('express').Response;
    const next = vi.fn();

    await authorizeMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Forbidden' });
  });

  it('executes observability onRequest and onResponse hooks', async () => {
    const app = { get: vi.fn() } as unknown as Express | Router;
    const mockHandler = vi.fn().mockResolvedValue({ ok: true });
    const onRequest = vi.fn();
    const onResponse = vi.fn();

    const config = {
      apiRoutes: [
        {
          access: 'public',
          handler: mockHandler,
          path: '/items',
          type: 'api',
        },
      ],
      observability: { onRequest, onResponse },
      spa: { root: '/var/www' },
    } as unknown as ServerConfig;

    await registerRoutes(app, config, noopLogger);

    const getCall = (app.get as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const middlewares = getCall.slice(1) as RequestHandler[];
    const obsMiddleware = middlewares[0]!;

    const req = {
      body: {},
      headers: {},
      method: 'GET',
      params: {},
      path: '/items',
      query: {},
    } as unknown as import('express').Request;
    const res = {
      json: vi.fn(),
      on: vi.fn((_event: string, cb: () => void) => {
        cb();
      }),
      statusCode: 200,
    } as unknown as import('express').Response;
    const next = vi.fn();

    obsMiddleware(req, res, next);

    expect(onRequest).toHaveBeenCalled();
    expect(res.on).toHaveBeenCalledWith('finish', expect.any(Function));
    expect(next).toHaveBeenCalled();
  });

  it('skips observability when no onRequest or onResponse', async () => {
    const app = { get: vi.fn() } as unknown as Express | Router;
    const mockHandler = vi.fn().mockResolvedValue({ ok: true });

    const config = {
      apiRoutes: [
        {
          access: 'public',
          handler: mockHandler,
          path: '/items',
          type: 'api',
        },
      ],
      observability: {},
      spa: { root: '/var/www' },
    } as unknown as ServerConfig;

    await registerRoutes(app, config, noopLogger);

    const getCall = (app.get as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const middlewares = getCall.slice(1) as RequestHandler[];
    expect(middlewares.length).toBe(1);
  });

  it('resolves async secret function', async () => {
    const app = { get: vi.fn() } as unknown as Express | Router;
    const mockHandler = vi.fn().mockResolvedValue({ ok: true });
    const mockAuthMiddleware = vi.fn();
    vi.mocked(createAuthMiddleware).mockReturnValue(
      mockAuthMiddleware as unknown as RequestHandler,
    );

    const config = {
      apiRoutes: [
        {
          access: 'private',
          handler: mockHandler,
          path: '/items',
          type: 'api',
        },
      ],
      security: { auth: { secret: async () => 'async-secret', strategy: 'bearer' } },
      spa: { root: '/var/www' },
    } as unknown as ServerConfig;

    await registerRoutes(app, config, noopLogger);

    expect(createAuthMiddleware).toHaveBeenCalledWith(expect.any(Uint8Array), undefined);
  });

  it('returns undefined auth middleware when no security auth configured', async () => {
    const app = { get: vi.fn() } as unknown as Express | Router;
    const mockHandler = vi.fn().mockResolvedValue({ ok: true });

    const config = {
      apiRoutes: [
        {
          access: 'public',
          handler: mockHandler,
          path: '/items',
          type: 'api',
        },
      ],
      spa: { root: '/var/www' },
    } as unknown as ServerConfig;

    await registerRoutes(app, config, noopLogger);

    expect(createAuthMiddleware).not.toHaveBeenCalled();
    expect(createJwksAuthMiddleware).not.toHaveBeenCalled();
  });

  it('returns undefined auth middleware when auth has no secret or jwksUri', async () => {
    const app = { get: vi.fn() } as unknown as Express | Router;
    const mockHandler = vi.fn().mockResolvedValue({ ok: true });

    const config = {
      apiRoutes: [
        {
          access: 'public',
          handler: mockHandler,
          path: '/items',
          type: 'api',
        },
      ],
      security: { auth: { strategy: 'bearer' } },
      spa: { root: '/var/www' },
    } as unknown as ServerConfig;

    await registerRoutes(app, config, noopLogger);

    expect(createAuthMiddleware).not.toHaveBeenCalled();
    expect(createJwksAuthMiddleware).not.toHaveBeenCalled();
  });

  it('registers proxy route with authorize middleware', async () => {
    const app = { get: vi.fn() } as unknown as Express | Router;
    const mockProxyHandler = vi.fn();
    vi.mocked(createProxyService).mockReturnValue(mockProxyHandler as unknown as RequestHandler);

    const authorizeFn = vi.fn().mockResolvedValue(true);

    const config = {
      proxyRoutes: [
        {
          access: 'public',
          authorize: authorizeFn,
          methods: ['get'],
          path: '/api',
          proxyPath: '/api',
          target: 'https://api.example.com',
          type: 'proxy',
        },
      ],
      spa: { root: '/var/www' },
    } as unknown as ServerConfig;

    await registerRoutes(app, config, noopLogger);

    const getCall = (app.get as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const middlewares = getCall.slice(1) as RequestHandler[];
    expect(middlewares.length).toBe(2);
    expect(middlewares[1]).toBe(mockProxyHandler);
  });

  it('registers proxy route with observability', async () => {
    const app = { get: vi.fn() } as unknown as Express | Router;
    const mockProxyHandler = vi.fn();
    vi.mocked(createProxyService).mockReturnValue(mockProxyHandler as unknown as RequestHandler);

    const onRequest = vi.fn();

    const config = {
      observability: { onRequest },
      proxyRoutes: [
        {
          access: 'public',
          methods: ['get'],
          path: '/api',
          proxyPath: '/api',
          target: 'https://api.example.com',
          type: 'proxy',
        },
      ],
      spa: { root: '/var/www' },
    } as unknown as ServerConfig;

    await registerRoutes(app, config, noopLogger);

    const getCall = (app.get as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const middlewares = getCall.slice(1) as RequestHandler[];
    expect(middlewares.length).toBe(2);
    expect(middlewares[1]).toBe(mockProxyHandler);
  });

  it('uses JWKS with audience when both are configured', async () => {
    const app = { get: vi.fn() } as unknown as Express | Router;
    const mockHandler = vi.fn().mockResolvedValue({ ok: true });
    const mockJwksMiddleware = vi.fn();
    vi.mocked(createJwksAuthMiddleware).mockReturnValue(
      mockJwksMiddleware as unknown as RequestHandler,
    );

    const config = {
      apiRoutes: [
        {
          access: 'private',
          handler: mockHandler,
          path: '/profile',
          type: 'api',
        },
      ],
      security: {
        auth: {
          audience: 'my-api',
          jwksUri: 'https://auth.example.com/.well-known/jwks.json',
          strategy: 'jwks',
        },
      },
      spa: { root: '/var/www' },
    } as unknown as ServerConfig;

    await registerRoutes(app, config, noopLogger);

    expect(createJwksAuthMiddleware).toHaveBeenCalledWith(
      'https://auth.example.com/.well-known/jwks.json',
      'my-api',
    );
  });

  it('uses default proxyPath when proxyPath is not provided', async () => {
    const app = { get: vi.fn() } as unknown as Express | Router;
    const mockProxyHandler = vi.fn();
    vi.mocked(createProxyService).mockReturnValue(mockProxyHandler as unknown as RequestHandler);

    const config = {
      proxyRoutes: [
        {
          access: 'public',
          methods: ['get'],
          path: '/users',
          target: 'https://api.example.com',
          type: 'proxy',
        },
      ],
      spa: { root: '/var/www' },
    } as unknown as ServerConfig;

    await registerRoutes(app, config, noopLogger);

    expect(createProxyService).toHaveBeenCalledWith(
      'https://api.example.com',
      '/users',
      undefined,
      undefined,
      undefined,
      undefined,
      noopLogger,
    );
  });

  it('builds request context with params and query serialization', async () => {
    const app = { get: vi.fn() } as unknown as Express | Router;
    const mockHandler = vi.fn().mockResolvedValue({ ok: true });
    const authorizeFn = vi.fn().mockResolvedValue(true);

    const config = {
      apiRoutes: [
        {
          access: 'public',
          authorize: authorizeFn,
          handler: mockHandler,
          path: '/items',
          type: 'api',
        },
      ],
      spa: { root: '/var/www' },
    } as unknown as ServerConfig;

    await registerRoutes(app, config, noopLogger);

    const getCall = (app.get as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const middlewares = getCall.slice(1) as RequestHandler[];
    const authorizeMiddleware = middlewares[0]!;

    const req = {
      body: {},
      headers: {},
      method: 'GET',
      params: { id: '123', num: 456 },
      path: '/items',
      query: { filter: 'active', tags: ['a', 'b'] },
    } as unknown as import('express').Request;
    const res = {
      json: vi.fn().mockReturnThis(),
      status: vi.fn().mockReturnThis(),
    } as unknown as import('express').Response;
    const next = vi.fn();

    await authorizeMiddleware(req, res, next);

    expect(authorizeFn).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { id: '123', num: '456' },
        query: { filter: 'active', tags: ['a', 'b'] },
      }),
      undefined,
      noopLogger,
    );
  });
});

it('executes api handler and returns result', async () => {
  const app = { get: vi.fn() } as unknown as Express | Router;
  const mockHandler = vi.fn().mockResolvedValue({ id: 1, name: 'test' });

  const config = {
    apiRoutes: [
      {
        access: 'public',
        handler: mockHandler,
        path: '/items',
        type: 'api',
      },
    ],
    spa: { root: '/var/www' },
  } as unknown as ServerConfig;

  await registerRoutes(app, config, noopLogger);

  const getCall = (app.get as ReturnType<typeof vi.fn>).mock.calls[0]!;
  const handler = getCall[1] as RequestHandler;

  const req = {
    body: {},
    headers: {},
    method: 'GET',
    params: {},
    path: '/items',
    query: {},
  } as unknown as import('express').Request;
  const res = { json: vi.fn() } as unknown as import('express').Response;
  const next = vi.fn();

  await handler(req, res, next);

  expect(mockHandler).toHaveBeenCalled();
  expect(res.json).toHaveBeenCalledWith({ id: 1, name: 'test' });
});

it('calls next with error when api handler throws', async () => {
  const app = { get: vi.fn() } as unknown as Express | Router;
  const testError = new Error('Handler failed');
  const mockHandler = vi.fn().mockRejectedValue(testError);

  const config = {
    apiRoutes: [
      {
        access: 'public',
        handler: mockHandler,
        path: '/items',
        type: 'api',
      },
    ],
    spa: { root: '/var/www' },
  } as unknown as ServerConfig;

  await registerRoutes(app, config, noopLogger);

  const getCall = (app.get as ReturnType<typeof vi.fn>).mock.calls[0]!;
  const handler = getCall[1] as RequestHandler;

  const req = {
    body: {},
    headers: {},
    method: 'GET',
    params: {},
    path: '/items',
    query: {},
  } as unknown as import('express').Request;
  const res = { json: vi.fn() } as unknown as import('express').Response;
  const next = vi.fn();

  await handler(req, res, next);

  expect(next).toHaveBeenCalledWith(testError);
});

it('skips observability when route observe is false', async () => {
  const app = { get: vi.fn() } as unknown as Express | Router;
  const mockHandler = vi.fn().mockResolvedValue({ ok: true });
  const onRequest = vi.fn();

  const config = {
    apiRoutes: [
      {
        access: 'public',
        handler: mockHandler,
        observe: false,
        path: '/items',
        type: 'api',
      },
    ],
    observability: { onRequest },
    spa: { root: '/var/www' },
  } as unknown as ServerConfig;

  await registerRoutes(app, config, noopLogger);

  const getCall = (app.get as ReturnType<typeof vi.fn>).mock.calls[0]!;
  const middlewares = getCall.slice(1) as RequestHandler[];
  expect(middlewares.length).toBe(1);
});

it('registers routes with validation schema', async () => {
  const app = { post: vi.fn() } as unknown as Express | Router;
  const mockHandler = vi.fn().mockResolvedValue({ created: true });
  const { z } = await import('zod');

  const config = {
    apiRoutes: [
      {
        access: 'public',
        handler: mockHandler,
        method: 'post',
        path: '/items',
        type: 'api',
        validationSchema: z.object({ name: z.string() }),
      },
    ],
    spa: { root: '/var/www' },
  } as unknown as ServerConfig;

  await registerRoutes(app, config, noopLogger);

  expect(app.post).toHaveBeenCalledTimes(1);
  const postCall = (app.post as ReturnType<typeof vi.fn>).mock.calls[0]!;
  expect(postCall.length).toBeGreaterThan(2);
});

it('registers proxy routes with transform function', async () => {
  const app = { get: vi.fn() } as unknown as Express | Router;
  const mockProxyHandler = vi.fn();
  vi.mocked(createProxyService).mockReturnValue(mockProxyHandler as unknown as RequestHandler);

  const transformFn = vi.fn().mockReturnValue({ body: {}, headers: {} });

  const config = {
    proxyRoutes: [
      {
        access: 'public',
        methods: ['get'],
        path: '/api',
        proxyPath: '/api',
        target: 'https://api.example.com',
        transform: transformFn,
        type: 'proxy',
      },
    ],
    spa: { root: '/var/www' },
  } as unknown as ServerConfig;

  await registerRoutes(app, config, noopLogger);

  expect(createProxyService).toHaveBeenCalledWith(
    'https://api.example.com',
    '/api',
    '/api',
    undefined,
    transformFn,
    undefined,
    noopLogger,
  );
});

it('registers proxy routes with timeout', async () => {
  const app = { get: vi.fn() } as unknown as Express | Router;
  const mockProxyHandler = vi.fn();
  vi.mocked(createProxyService).mockReturnValue(mockProxyHandler as unknown as RequestHandler);

  const config = {
    proxyRoutes: [
      {
        access: 'public',
        methods: ['get'],
        path: '/api',
        proxyPath: '/api',
        target: 'https://api.example.com',
        timeout: 5000,
        type: 'proxy',
      },
    ],
    spa: { root: '/var/www' },
  } as unknown as ServerConfig;

  await registerRoutes(app, config, noopLogger);

  expect(createProxyService).toHaveBeenCalledWith(
    'https://api.example.com',
    '/api',
    '/api',
    undefined,
    undefined,
    5000,
    noopLogger,
  );
});
