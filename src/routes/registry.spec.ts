import type { Express, Router } from 'express';
import { createAuthMiddleware, createJwksAuthMiddleware } from '../middleware/auth';
import { createProxyService } from '../services/proxy';
import { registerApiRoutes, registerProxyRoutes } from './registry';

vi.mock('../middleware/auth', () => ({
  createAuthMiddleware: vi.fn(),
  createJwksAuthMiddleware: vi.fn(),
}));

vi.mock('../services/proxy', () => ({
  createProxyService: vi.fn(),
}));

describe('registerProxyRoutes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does nothing when proxy config is missing', () => {
    const app = { use: vi.fn() } as unknown as Express | Router;
    const config = {
      app: { spa: { root: '/var/www' } },
      auth: { strategy: 'bearer', secret: 'secret' },
    } as any;

    registerProxyRoutes(app, config);

    expect(app.use).not.toHaveBeenCalled();
  });

  it('registers public proxy routes without auth middleware', () => {
    const app = { use: vi.fn() } as unknown as Express | Router;
    const mockProxyHandler = vi.fn();
    vi.mocked(createProxyService).mockReturnValue(mockProxyHandler as any);

    const config = {
      app: { spa: { root: '/var/www' } },
      auth: { strategy: 'bearer', secret: 'secret' },
      proxy: {
        basePath: '/api',
        routes: [{ path: '/users', access: 'public', target: 'https://api.example.com' }],
      },
    } as any;

    registerProxyRoutes(app, config);

    expect(app.use).toHaveBeenCalledWith('/api/users', mockProxyHandler);
    expect(createAuthMiddleware).toHaveBeenCalledTimes(1);
  });

  it('registers private proxy routes with auth middleware', () => {
    const app = { use: vi.fn() } as unknown as Express | Router;
    const mockProxyHandler = vi.fn();
    const mockAuthMiddleware = vi.fn();
    vi.mocked(createProxyService).mockReturnValue(mockProxyHandler as any);
    vi.mocked(createAuthMiddleware).mockReturnValue(mockAuthMiddleware as any);

    const config = {
      app: { spa: { root: '/var/www' } },
      auth: { strategy: 'bearer', secret: 'secret' },
      proxy: {
        basePath: '/api',
        routes: [{ path: '/admin', access: 'private', target: 'https://api.example.com' }],
      },
    } as any;

    registerProxyRoutes(app, config);

    expect(app.use).toHaveBeenCalledWith('/api/admin', mockAuthMiddleware, mockProxyHandler);
  });

  it('registers multiple proxy routes', () => {
    const app = { use: vi.fn() } as unknown as Express | Router;
    const mockProxyHandler = vi.fn();
    vi.mocked(createProxyService).mockReturnValue(mockProxyHandler as any);

    const config = {
      app: { spa: { root: '/var/www' } },
      auth: { strategy: 'bearer', secret: 'secret' },
      proxy: {
        basePath: '/proxy',
        routes: [
          { path: '/users', access: 'public', target: 'https://api1.example.com' },
          { path: '/orders', access: 'public', target: 'https://api2.example.com' },
        ],
      },
    } as any;

    registerProxyRoutes(app, config);

    expect(app.use).toHaveBeenCalledWith('/proxy/users', mockProxyHandler);
    expect(app.use).toHaveBeenCalledWith('/proxy/orders', mockProxyHandler);
    expect(app.use).toHaveBeenCalledTimes(2);
  });

  it('uses JWKS middleware when strategy is jwks', () => {
    const app = { use: vi.fn() } as unknown as Express | Router;
    const mockProxyHandler = vi.fn();
    const mockJwksMiddleware = vi.fn();
    vi.mocked(createProxyService).mockReturnValue(mockProxyHandler as any);
    vi.mocked(createJwksAuthMiddleware).mockReturnValue(mockJwksMiddleware as any);

    const config = {
      app: { spa: { root: '/var/www' } },
      auth: { strategy: 'jwks', jwksUri: 'https://auth.example.com/.well-known/jwks.json' },
      proxy: {
        basePath: '/api',
        routes: [{ path: '/admin', access: 'private', target: 'https://api.example.com' }],
      },
    } as any;

    registerProxyRoutes(app, config);

    expect(createJwksAuthMiddleware).toHaveBeenCalledWith(
      'https://auth.example.com/.well-known/jwks.json'
    );
    expect(app.use).toHaveBeenCalledWith('/api/admin', mockJwksMiddleware, mockProxyHandler);
  });
});

describe('registerApiRoutes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does nothing when api config is missing', () => {
    const app = {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    } as unknown as Express | Router;
    const config = {
      app: { spa: { root: '/var/www' } },
      auth: { strategy: 'bearer', secret: 'secret' },
    } as any;

    registerApiRoutes(app, config);

    expect(app.get).not.toHaveBeenCalled();
    expect(app.post).not.toHaveBeenCalled();
  });

  it('registers public api routes without auth middleware', () => {
    const app = {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    } as unknown as Express | Router;
    const mockHandler = vi.fn();

    const config = {
      app: { spa: { root: '/var/www' } },
      auth: { strategy: 'bearer', secret: 'secret' },
      api: {
        basePath: '/bff',
        routes: [{ path: '/health', access: 'public', handler: mockHandler }],
      },
    } as any;

    registerApiRoutes(app, config);

    expect(app.get).toHaveBeenCalledWith('/bff/health', mockHandler);
    expect(createAuthMiddleware).toHaveBeenCalledTimes(1);
  });

  it('registers private api routes with auth middleware', () => {
    const app = {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    } as unknown as Express | Router;
    const mockHandler = vi.fn();
    const mockAuthMiddleware = vi.fn();
    vi.mocked(createAuthMiddleware).mockReturnValue(mockAuthMiddleware as any);

    const config = {
      app: { spa: { root: '/var/www' } },
      auth: { strategy: 'bearer', secret: 'secret' },
      api: {
        basePath: '/bff',
        routes: [{ path: '/profile', access: 'private', handler: mockHandler }],
      },
    } as any;

    registerApiRoutes(app, config);

    expect(app.get).toHaveBeenCalledWith('/bff/profile', mockAuthMiddleware, mockHandler);
  });

  it('registers multiple api routes', () => {
    const app = {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    } as unknown as Express | Router;
    const mockHandler1 = vi.fn();
    const mockHandler2 = vi.fn();
    const mockAuthMiddleware = vi.fn();
    vi.mocked(createAuthMiddleware).mockReturnValue(mockAuthMiddleware as any);

    const config = {
      app: { spa: { root: '/var/www' } },
      auth: { strategy: 'bearer', secret: 'secret' },
      api: {
        basePath: '/api',
        routes: [
          { path: '/public', access: 'public', handler: mockHandler1 },
          { path: '/private', access: 'private', handler: mockHandler2 },
        ],
      },
    } as any;

    registerApiRoutes(app, config);

    expect(app.get).toHaveBeenCalledWith('/api/public', mockHandler1);
    expect(app.get).toHaveBeenCalledWith('/api/private', mockAuthMiddleware, mockHandler2);
    expect(app.get).toHaveBeenCalledTimes(2);
  });

  it('registers POST routes when method is post', () => {
    const app = {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    } as unknown as Express | Router;
    const mockHandler = vi.fn();
    const mockAuthMiddleware = vi.fn();
    vi.mocked(createAuthMiddleware).mockReturnValue(mockAuthMiddleware as any);

    const config = {
      app: { spa: { root: '/var/www' } },
      auth: { strategy: 'bearer', secret: 'secret' },
      api: {
        basePath: '/api',
        routes: [
          { path: '/create', access: 'public', handler: mockHandler, method: 'post' },
          { path: '/update', access: 'private', handler: mockHandler, method: 'post' },
        ],
      },
    } as any;

    registerApiRoutes(app, config);

    expect(app.post).toHaveBeenCalledWith('/api/create', mockHandler);
    expect(app.post).toHaveBeenCalledWith('/api/update', mockAuthMiddleware, mockHandler);
    expect(app.post).toHaveBeenCalledTimes(2);
    expect(app.get).not.toHaveBeenCalled();
  });

  it('registers PUT routes when method is put', () => {
    const app = {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    } as unknown as Express | Router;
    const mockHandler = vi.fn();

    const config = {
      app: { spa: { root: '/var/www' } },
      auth: { strategy: 'bearer', secret: 'secret' },
      api: {
        basePath: '/api',
        routes: [{ path: '/update/:id', access: 'public', handler: mockHandler, method: 'put' }],
      },
    } as any;

    registerApiRoutes(app, config);

    expect(app.put).toHaveBeenCalledWith('/api/update/:id', mockHandler);
  });

  it('registers DELETE routes when method is delete', () => {
    const app = {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    } as unknown as Express | Router;
    const mockHandler = vi.fn();
    const mockAuthMiddleware = vi.fn();
    vi.mocked(createAuthMiddleware).mockReturnValue(mockAuthMiddleware as any);

    const config = {
      app: { spa: { root: '/var/www' } },
      auth: { strategy: 'bearer', secret: 'secret' },
      api: {
        basePath: '/api',
        routes: [
          { path: '/delete/:id', access: 'private', handler: mockHandler, method: 'delete' },
        ],
      },
    } as any;

    registerApiRoutes(app, config);

    expect(app.delete).toHaveBeenCalledWith('/api/delete/:id', mockAuthMiddleware, mockHandler);
  });

  it('defaults to GET when method is not specified', () => {
    const app = {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    } as unknown as Express | Router;
    const mockHandler = vi.fn();

    const config = {
      app: { spa: { root: '/var/www' } },
      auth: { strategy: 'bearer', secret: 'secret' },
      api: {
        basePath: '/api',
        routes: [{ path: '/data', access: 'public', handler: mockHandler }],
      },
    } as any;

    registerApiRoutes(app, config);

    expect(app.get).toHaveBeenCalledWith('/api/data', mockHandler);
  });

  it('uses JWKS middleware when strategy is jwks', () => {
    const app = {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    } as unknown as Express | Router;
    const mockHandler = vi.fn();
    const mockJwksMiddleware = vi.fn();
    vi.mocked(createJwksAuthMiddleware).mockReturnValue(mockJwksMiddleware as any);

    const config = {
      app: { spa: { root: '/var/www' } },
      auth: { strategy: 'jwks', jwksUri: 'https://auth.example.com/.well-known/jwks.json' },
      api: {
        basePath: '/api',
        routes: [{ path: '/profile', access: 'private', handler: mockHandler }],
      },
    } as any;

    registerApiRoutes(app, config);

    expect(createJwksAuthMiddleware).toHaveBeenCalledWith(
      'https://auth.example.com/.well-known/jwks.json'
    );
    expect(app.get).toHaveBeenCalledWith('/api/profile', mockJwksMiddleware, mockHandler);
  });
});
