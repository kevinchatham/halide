import type { Express, Router } from 'express';
import { createAuthMiddleware, createJwksAuthMiddleware } from '../middleware/auth';
import { createProxyService } from '../services/proxy';
import { registerRoutes } from './registry';

vi.mock('../middleware/auth', () => ({
  createAuthMiddleware: vi.fn(),
  createJwksAuthMiddleware: vi.fn(),
}));

vi.mock('../services/proxy', () => ({
  createProxyService: vi.fn(),
}));

describe('registerRoutes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does nothing when routes is missing', async () => {
    const app = { get: vi.fn() } as unknown as Express | Router;
    const config = {
      spa: { root: '/var/www' },
      security: { auth: { strategy: 'bearer', secret: 'secret' } },
    } as any;

    await registerRoutes(app, config);

    expect(app.get).not.toHaveBeenCalled();
  });

  it('registers public proxy routes without auth middleware', async () => {
    const app = {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    } as unknown as Express | Router;
    const mockProxyHandler = vi.fn();
    vi.mocked(createProxyService).mockReturnValue(mockProxyHandler as any);

    const config = {
      spa: { root: '/var/www' },
      security: { auth: { strategy: 'bearer', secret: 'secret' } },
      proxyRoutes: [
        {
          type: 'proxy',
          path: '/users',
          access: 'public',
          methods: ['get', 'post', 'put', 'patch', 'delete'],
          target: 'https://api.example.com',
          proxyPath: '/api/users',
        },
      ],
    } as any;

    await registerRoutes(app, config);

    expect(app.get).toHaveBeenCalledWith('/users', mockProxyHandler);
    expect(app.post).toHaveBeenCalledWith('/users', mockProxyHandler);
    expect(app.put).toHaveBeenCalledWith('/users', mockProxyHandler);
    expect(app.patch).toHaveBeenCalledWith('/users', mockProxyHandler);
    expect(app.delete).toHaveBeenCalledWith('/users', mockProxyHandler);
  });

  it('registers private proxy routes with auth middleware', async () => {
    const app = {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    } as unknown as Express | Router;
    const mockProxyHandler = vi.fn();
    const mockAuthMiddleware = vi.fn();
    vi.mocked(createProxyService).mockReturnValue(mockProxyHandler as any);
    vi.mocked(createAuthMiddleware).mockReturnValue(mockAuthMiddleware as any);

    const config = {
      spa: { root: '/var/www' },
      security: { auth: { strategy: 'bearer', secret: 'secret' } },
      proxyRoutes: [
        {
          type: 'proxy',
          path: '/admin',
          access: 'private',
          methods: ['get', 'post', 'put', 'patch', 'delete'],
          target: 'https://api.example.com',
          proxyPath: '/api/admin',
        },
      ],
    } as any;

    await registerRoutes(app, config);

    expect(app.get).toHaveBeenCalledWith('/admin', mockAuthMiddleware, mockProxyHandler);
    expect(app.post).toHaveBeenCalledWith('/admin', mockAuthMiddleware, mockProxyHandler);
    expect(app.put).toHaveBeenCalledWith('/admin', mockAuthMiddleware, mockProxyHandler);
    expect(app.patch).toHaveBeenCalledWith('/admin', mockAuthMiddleware, mockProxyHandler);
    expect(app.delete).toHaveBeenCalledWith('/admin', mockAuthMiddleware, mockProxyHandler);
  });

  it('registers multiple proxy routes', async () => {
    const app = {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    } as unknown as Express | Router;
    const mockProxyHandler = vi.fn();
    vi.mocked(createProxyService).mockReturnValue(mockProxyHandler as any);

    const config = {
      spa: { root: '/var/www' },
      security: { auth: { strategy: 'bearer', secret: 'secret' } },
      proxyRoutes: [
        {
          type: 'proxy',
          path: '/users',
          access: 'public',
          methods: ['get', 'post', 'put', 'patch', 'delete'],
          target: 'https://api1.example.com',
          proxyPath: '/users',
        },
        {
          type: 'proxy',
          path: '/orders',
          access: 'public',
          methods: ['get', 'post', 'put', 'patch', 'delete'],
          target: 'https://api2.example.com',
          proxyPath: '/orders',
        },
      ],
    } as any;

    await registerRoutes(app, config);

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
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    } as unknown as Express | Router;
    const mockProxyHandler = vi.fn();
    const mockJwksMiddleware = vi.fn();
    vi.mocked(createProxyService).mockReturnValue(mockProxyHandler as any);
    vi.mocked(createJwksAuthMiddleware).mockReturnValue(mockJwksMiddleware as any);

    const config = {
      spa: { root: '/var/www' },
      security: {
        auth: { strategy: 'jwks', jwksUri: 'https://auth.example.com/.well-known/jwks.json' },
      },
      proxyRoutes: [
        {
          type: 'proxy',
          path: '/admin',
          access: 'private',
          methods: ['get', 'post', 'put', 'patch', 'delete'],
          target: 'https://api.example.com',
          proxyPath: '/admin',
        },
      ],
    } as any;

    await registerRoutes(app, config);

    expect(createJwksAuthMiddleware).toHaveBeenCalledWith(
      'https://auth.example.com/.well-known/jwks.json',
      undefined
    );
    expect(app.get).toHaveBeenCalledWith('/admin', mockJwksMiddleware, mockProxyHandler);
    expect(app.post).toHaveBeenCalledWith('/admin', mockJwksMiddleware, mockProxyHandler);
    expect(app.put).toHaveBeenCalledWith('/admin', mockJwksMiddleware, mockProxyHandler);
    expect(app.patch).toHaveBeenCalledWith('/admin', mockJwksMiddleware, mockProxyHandler);
    expect(app.delete).toHaveBeenCalledWith('/admin', mockJwksMiddleware, mockProxyHandler);
  });

  it('registers private proxy routes with auth middleware', async () => {
    const app = {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    } as unknown as Express | Router;
    const mockProxyHandler = vi.fn();
    const mockAuthMiddleware = vi.fn();
    vi.mocked(createProxyService).mockReturnValue(mockProxyHandler as any);
    vi.mocked(createAuthMiddleware).mockReturnValue(mockAuthMiddleware as any);

    const config = {
      spa: { root: '/var/www' },
      security: { auth: { strategy: 'bearer', secret: 'secret' } },
      proxyRoutes: [
        {
          type: 'proxy',
          path: '/admin',
          access: 'private',
          methods: ['get', 'post', 'put', 'patch', 'delete'],
          target: 'https://api.example.com',
          proxyPath: '/api/admin',
        },
      ],
    } as any;

    await registerRoutes(app, config);

    expect(app.get).toHaveBeenCalledWith('/admin', mockAuthMiddleware, mockProxyHandler);
    expect(app.post).toHaveBeenCalledWith('/admin', mockAuthMiddleware, mockProxyHandler);
    expect(app.put).toHaveBeenCalledWith('/admin', mockAuthMiddleware, mockProxyHandler);
    expect(app.patch).toHaveBeenCalledWith('/admin', mockAuthMiddleware, mockProxyHandler);
    expect(app.delete).toHaveBeenCalledWith('/admin', mockAuthMiddleware, mockProxyHandler);
  });

  it('registers multiple proxy routes', async () => {
    const app = {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    } as unknown as Express | Router;
    const mockProxyHandler = vi.fn();
    vi.mocked(createProxyService).mockReturnValue(mockProxyHandler as any);

    const config = {
      spa: { root: '/var/www' },
      security: { auth: { strategy: 'bearer', secret: 'secret' } },
      proxyRoutes: [
        {
          type: 'proxy',
          path: '/users',
          access: 'public',
          methods: ['get', 'post', 'put', 'patch', 'delete'],
          target: 'https://api1.example.com',
          proxyPath: '/users',
        },
        {
          type: 'proxy',
          path: '/orders',
          access: 'public',
          methods: ['get', 'post', 'put', 'patch', 'delete'],
          target: 'https://api2.example.com',
          proxyPath: '/orders',
        },
      ],
    } as any;

    await registerRoutes(app, config);

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
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    } as unknown as Express | Router;
    const mockProxyHandler = vi.fn();
    const mockJwksMiddleware = vi.fn();
    vi.mocked(createProxyService).mockReturnValue(mockProxyHandler as any);
    vi.mocked(createJwksAuthMiddleware).mockReturnValue(mockJwksMiddleware as any);

    const config = {
      spa: { root: '/var/www' },
      security: {
        auth: { strategy: 'jwks', jwksUri: 'https://auth.example.com/.well-known/jwks.json' },
      },
      proxyRoutes: [
        {
          type: 'proxy',
          path: '/admin',
          access: 'private',
          methods: ['get', 'post', 'put', 'patch', 'delete'],
          target: 'https://api.example.com',
          proxyPath: '/admin',
        },
      ],
    } as any;

    await registerRoutes(app, config);

    expect(createJwksAuthMiddleware).toHaveBeenCalledWith(
      'https://auth.example.com/.well-known/jwks.json',
      undefined
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
      spa: { root: '/var/www' },
      security: { auth: { strategy: 'bearer', secret: 'secret' } },
      apiRoutes: [{ type: 'api', path: '/health', access: 'public', handler: mockHandler }],
    } as any;

    await registerRoutes(app, config);

    expect(app.get).toHaveBeenCalledTimes(1);
    expect(app.get).toHaveBeenCalledWith('/health', expect.any(Function));
  });

  it('registers private api routes with auth middleware', async () => {
    const app = { get: vi.fn() } as unknown as Express | Router;
    const mockHandler = vi.fn();
    const mockAuthMiddleware = vi.fn();
    vi.mocked(createAuthMiddleware).mockReturnValue(mockAuthMiddleware as any);

    const config = {
      spa: { root: '/var/www' },
      security: { auth: { strategy: 'bearer', secret: 'secret' } },
      apiRoutes: [{ type: 'api', path: '/profile', access: 'private', handler: mockHandler }],
    } as any;

    await registerRoutes(app, config);

    expect(app.get).toHaveBeenCalledTimes(1);
    expect(app.get).toHaveBeenCalledWith('/profile', mockAuthMiddleware, expect.any(Function));
  });

  it('registers multiple api routes', async () => {
    const app = { get: vi.fn() } as unknown as Express | Router;
    const mockHandler1 = vi.fn();
    const mockHandler2 = vi.fn();
    const mockAuthMiddleware = vi.fn();
    vi.mocked(createAuthMiddleware).mockReturnValue(mockAuthMiddleware as any);

    const config = {
      spa: { root: '/var/www' },
      security: { auth: { strategy: 'bearer', secret: 'secret' } },
      apiRoutes: [
        { type: 'api', path: '/public', access: 'public', handler: mockHandler1 },
        { type: 'api', path: '/private', access: 'private', handler: mockHandler2 },
      ],
    } as any;

    await registerRoutes(app, config);

    expect(app.get).toHaveBeenCalledTimes(2);
    expect(app.get).toHaveBeenCalledWith('/public', expect.any(Function));
    expect(app.get).toHaveBeenCalledWith('/private', mockAuthMiddleware, expect.any(Function));
  });

  it('registers POST routes when method is post', async () => {
    const app = { get: vi.fn(), post: vi.fn() } as unknown as Express | Router;
    const mockHandler = vi.fn();
    const mockAuthMiddleware = vi.fn();
    vi.mocked(createAuthMiddleware).mockReturnValue(mockAuthMiddleware as any);

    const config = {
      spa: { root: '/var/www' },
      security: { auth: { strategy: 'bearer', secret: 'secret' } },
      apiRoutes: [
        { type: 'api', path: '/create', access: 'public', handler: mockHandler, method: 'post' },
        { type: 'api', path: '/update', access: 'private', handler: mockHandler, method: 'post' },
      ],
    } as any;

    await registerRoutes(app, config);

    expect(app.post).toHaveBeenCalledTimes(2);
    expect(app.post).toHaveBeenCalledWith('/create', expect.any(Function));
    expect(app.post).toHaveBeenCalledWith('/update', mockAuthMiddleware, expect.any(Function));
    expect(app.get).not.toHaveBeenCalled();
  });

  it('registers PUT routes when method is put', async () => {
    const app = { get: vi.fn(), put: vi.fn() } as unknown as Express | Router;
    const mockHandler = vi.fn();

    const config = {
      spa: { root: '/var/www' },
      security: { auth: { strategy: 'bearer', secret: 'secret' } },
      apiRoutes: [
        { type: 'api', path: '/update/:id', access: 'public', handler: mockHandler, method: 'put' },
      ],
    } as any;

    await registerRoutes(app, config);

    expect(app.put).toHaveBeenCalledWith('/update/:id', expect.any(Function));
  });

  it('registers DELETE routes when method is delete', async () => {
    const app = { delete: vi.fn() } as unknown as Express | Router;
    const mockHandler = vi.fn();
    const mockAuthMiddleware = vi.fn();
    vi.mocked(createAuthMiddleware).mockReturnValue(mockAuthMiddleware as any);

    const config = {
      spa: { root: '/var/www' },
      security: { auth: { strategy: 'bearer', secret: 'secret' } },
      apiRoutes: [
        {
          type: 'api',
          path: '/delete/:id',
          access: 'private',
          handler: mockHandler,
          method: 'delete',
        },
      ],
    } as any;

    await registerRoutes(app, config);

    expect(app.delete).toHaveBeenCalledWith(
      '/delete/:id',
      mockAuthMiddleware,
      expect.any(Function)
    );
  });

  it('defaults to GET when method is not specified', async () => {
    const app = { get: vi.fn() } as unknown as Express | Router;
    const mockHandler = vi.fn();

    const config = {
      spa: { root: '/var/www' },
      security: { auth: { strategy: 'bearer', secret: 'secret' } },
      apiRoutes: [{ type: 'api', path: '/data', access: 'public', handler: mockHandler }],
    } as any;

    await registerRoutes(app, config);

    expect(app.get).toHaveBeenCalledWith('/data', expect.any(Function));
  });

  it('uses JWKS middleware for api routes when strategy is jwks', async () => {
    const app = { get: vi.fn() } as unknown as Express | Router;
    const mockHandler = vi.fn();
    const mockJwksMiddleware = vi.fn();
    vi.mocked(createJwksAuthMiddleware).mockReturnValue(mockJwksMiddleware as any);

    const config = {
      spa: { root: '/var/www' },
      security: {
        auth: { strategy: 'jwks', jwksUri: 'https://auth.example.com/.well-known/jwks.json' },
      },
      apiRoutes: [{ type: 'api', path: '/profile', access: 'private', handler: mockHandler }],
    } as any;

    await registerRoutes(app, config);

    expect(createJwksAuthMiddleware).toHaveBeenCalledWith(
      'https://auth.example.com/.well-known/jwks.json',
      undefined
    );
    expect(app.get).toHaveBeenCalledWith('/profile', mockJwksMiddleware, expect.any(Function));
  });

  it('passes identity function to createProxyService', async () => {
    const app = {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    } as unknown as Express | Router;
    const mockProxyHandler = vi.fn();
    vi.mocked(createProxyService).mockReturnValue(mockProxyHandler as any);

    const identityFn = (_ctx: any, claims: any) => ({
      'x-user-id': claims.sub,
    });

    const config = {
      spa: { root: '/var/www' },
      security: { auth: { strategy: 'bearer', secret: 'secret' } },
      proxyRoutes: [
        {
          type: 'proxy',
          path: '/users',
          access: 'private',
          methods: ['get', 'post', 'put', 'patch', 'delete'],
          target: 'https://api.example.com',
          proxyPath: '/api/users',
          identity: identityFn,
        },
      ],
    } as any;

    await registerRoutes(app, config);

    expect(createProxyService).toHaveBeenCalledWith(
      'https://api.example.com',
      '/users',
      '/api/users',
      identityFn,
      undefined,
      undefined
    );
  });
});
