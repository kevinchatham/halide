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
      security: { auth: { secret: 'secret', strategy: 'bearer' } },
      spa: { root: '/var/www' },
    } as any;

    await registerRoutes(app, config);

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
    vi.mocked(createProxyService).mockReturnValue(mockProxyHandler as any);

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
      delete: vi.fn(),
      get: vi.fn(),
      patch: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
    } as unknown as Express | Router;
    const mockProxyHandler = vi.fn();
    const mockAuthMiddleware = vi.fn();
    vi.mocked(createProxyService).mockReturnValue(mockProxyHandler as any);
    vi.mocked(createAuthMiddleware).mockReturnValue(mockAuthMiddleware as any);

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
      delete: vi.fn(),
      get: vi.fn(),
      patch: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
    } as unknown as Express | Router;
    const mockProxyHandler = vi.fn();
    vi.mocked(createProxyService).mockReturnValue(mockProxyHandler as any);

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
      delete: vi.fn(),
      get: vi.fn(),
      patch: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
    } as unknown as Express | Router;
    const mockProxyHandler = vi.fn();
    const mockJwksMiddleware = vi.fn();
    vi.mocked(createProxyService).mockReturnValue(mockProxyHandler as any);
    vi.mocked(createJwksAuthMiddleware).mockReturnValue(mockJwksMiddleware as any);

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
    } as any;

    await registerRoutes(app, config);

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
    vi.mocked(createProxyService).mockReturnValue(mockProxyHandler as any);
    vi.mocked(createAuthMiddleware).mockReturnValue(mockAuthMiddleware as any);

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
      delete: vi.fn(),
      get: vi.fn(),
      patch: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
    } as unknown as Express | Router;
    const mockProxyHandler = vi.fn();
    vi.mocked(createProxyService).mockReturnValue(mockProxyHandler as any);

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
      delete: vi.fn(),
      get: vi.fn(),
      patch: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
    } as unknown as Express | Router;
    const mockProxyHandler = vi.fn();
    const mockJwksMiddleware = vi.fn();
    vi.mocked(createProxyService).mockReturnValue(mockProxyHandler as any);
    vi.mocked(createJwksAuthMiddleware).mockReturnValue(mockJwksMiddleware as any);

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
    } as any;

    await registerRoutes(app, config);

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
    } as any;

    await registerRoutes(app, config);

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
    } as any;

    await registerRoutes(app, config);

    expect(createJwksAuthMiddleware).toHaveBeenCalledWith(
      'https://auth.example.com/.well-known/jwks.json',
      undefined,
    );
    expect(app.get).toHaveBeenCalledWith('/profile', mockJwksMiddleware, expect.any(Function));
  });

  it('passes identity function to createProxyService', async () => {
    const app = {
      delete: vi.fn(),
      get: vi.fn(),
      patch: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
    } as unknown as Express | Router;
    const mockProxyHandler = vi.fn();
    vi.mocked(createProxyService).mockReturnValue(mockProxyHandler as any);

    const identityFn = (_ctx: any, claims: any) => ({
      'x-user-id': claims.sub,
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
    } as any;

    await registerRoutes(app, config);

    expect(createProxyService).toHaveBeenCalledWith(
      'https://api.example.com',
      '/users',
      '/api/users',
      identityFn,
      undefined,
      undefined,
    );
  });
});
