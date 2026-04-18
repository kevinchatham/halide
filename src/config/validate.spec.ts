import { validateServerConfig } from './validate';

describe('validateServerConfig', () => {
  it('accepts minimal valid config', () => {
    expect(() =>
      validateServerConfig({
        spa: { root: '/var/www' },
      })
    ).not.toThrow();
  });

  it('accepts full valid config', () => {
    expect(() =>
      validateServerConfig({
        spa: { name: 'test', root: '/public', fallback: 'index.html' },
        security: {
          cors: { origin: ['http://localhost:3000'], credentials: true },
          csp: { directives: { 'default-src': ["'self'"] } },
          auth: { strategy: 'bearer', secret: () => 'secret123' },
        },
      })
    ).not.toThrow();
  });

  it('rejects missing spa.root', () => {
    expect(() =>
      validateServerConfig({
        spa: {},
      })
    ).toThrow('spa.root is required');
  });

  it('rejects missing spa', () => {
    expect(() => validateServerConfig({})).toThrow('spa.root is required');
  });

  it('rejects route path not starting with /', () => {
    expect(() =>
      validateServerConfig({
        spa: { root: '/var/www' },
        apiRoutes: [
          {
            type: 'api',
            path: 'invalid',
            access: 'public',
            handler: async () => ({}),
          },
        ],
      })
    ).toThrow('Route path must start with / (api): invalid');
  });

  it('rejects API route without handler', () => {
    expect(() =>
      validateServerConfig({
        spa: { root: '/var/www' },
        apiRoutes: [
          {
            type: 'api',
            path: '/test',
            access: 'public',
          },
        ],
      })
    ).toThrow('API route requires handler');
  });

  it('rejects proxy route without target', () => {
    expect(() =>
      validateServerConfig({
        spa: { root: '/var/www' },
        proxyRoutes: [
          {
            type: 'proxy',
            path: '/test',
            access: 'public',
            methods: ['get'],
          },
        ],
      })
    ).toThrow('Proxy route requires target');
  });

  it('rejects proxy route with empty methods', () => {
    expect(() =>
      validateServerConfig({
        spa: { root: '/var/www' },
        proxyRoutes: [
          {
            type: 'proxy',
            path: '/test',
            access: 'public',
            methods: [],
            target: 'https://api.example.com',
          },
        ],
      })
    ).toThrow('Proxy route requires at least one method');
  });

  it('rejects proxy route proxyPath not starting with /', () => {
    expect(() =>
      validateServerConfig({
        spa: { root: '/var/www' },
        proxyRoutes: [
          {
            type: 'proxy',
            path: '/test',
            access: 'public',
            methods: ['get'],
            target: 'https://api.example.com',
            proxyPath: 'invalid',
          },
        ],
      })
    ).toThrow('Proxy route proxyPath must start with /: invalid');
  });

  it('rejects wildcard origin with credentials true', () => {
    expect(() =>
      validateServerConfig({
        spa: { root: '/var/www' },
        security: {
          cors: { origin: '*', credentials: true },
          auth: { strategy: 'bearer', secret: () => 'secret' },
        },
      })
    ).toThrow('Wildcard origin cannot be used with credentials: true');
  });

  it('rejects wildcard origin in array with credentials true', () => {
    expect(() =>
      validateServerConfig({
        spa: { root: '/var/www' },
        security: {
          cors: { origin: ['http://localhost:3000', '*'], credentials: true },
          auth: { strategy: 'bearer', secret: () => 'secret' },
        },
      })
    ).toThrow('Wildcard origin cannot be used with credentials: true');
  });

  it('accepts wildcard origin without credentials', () => {
    expect(() =>
      validateServerConfig({
        spa: { root: '/var/www' },
        security: {
          cors: { origin: '*', credentials: false },
        },
      })
    ).not.toThrow();
  });

  it('rejects bearer strategy without secret', () => {
    expect(() =>
      validateServerConfig({
        spa: { root: '/var/www' },
        security: {
          auth: { strategy: 'bearer' },
        },
      })
    ).toThrow('auth.secret is required when strategy is bearer');
  });

  it('accepts bearer strategy with secret', () => {
    expect(() =>
      validateServerConfig({
        spa: { root: '/var/www' },
        security: {
          auth: { strategy: 'bearer', secret: () => 'secret' },
        },
      })
    ).not.toThrow();
  });

  it('rejects jwks strategy without jwksUri', () => {
    expect(() =>
      validateServerConfig({
        spa: { root: '/var/www' },
        security: {
          auth: { strategy: 'jwks' },
        },
      })
    ).toThrow('auth.jwksUri is required when strategy is jwks');
  });

  it('accepts jwks strategy with jwksUri', () => {
    expect(() =>
      validateServerConfig({
        spa: { root: '/var/www' },
        security: {
          auth: { strategy: 'jwks', jwksUri: 'https://auth.example.com/.well-known/jwks.json' },
        },
      })
    ).not.toThrow();
  });

  it('rejects private routes without auth config', () => {
    expect(() =>
      validateServerConfig({
        spa: { root: '/var/www' },
        apiRoutes: [
          {
            type: 'api',
            path: '/private',
            access: 'private',
            handler: async () => ({}),
          },
        ],
      })
    ).toThrow("security.auth is required when routes have access: 'private'");
  });

  it('accepts private routes with auth config', () => {
    expect(() =>
      validateServerConfig({
        spa: { root: '/var/www' },
        apiRoutes: [
          {
            type: 'api',
            path: '/private',
            access: 'private',
            handler: async () => ({}),
          },
        ],
        security: {
          auth: { strategy: 'bearer', secret: () => 'secret' },
        },
      })
    ).not.toThrow();
  });

  it('accepts public routes without auth', () => {
    expect(() =>
      validateServerConfig({
        spa: { root: '/var/www' },
        apiRoutes: [
          {
            type: 'api',
            path: '/public',
            access: 'public',
            handler: async () => ({}),
          },
        ],
      })
    ).not.toThrow();
  });

  it('accepts valid proxy route', () => {
    expect(() =>
      validateServerConfig({
        spa: { root: '/var/www' },
        proxyRoutes: [
          {
            type: 'proxy',
            path: '/api/users',
            access: 'public',
            methods: ['get', 'post'],
            target: 'https://api.example.com',
            proxyPath: '/users',
            timeout: 5000,
          },
        ],
      })
    ).not.toThrow();
  });

  it('treats route without type as API route', () => {
    expect(() =>
      validateServerConfig({
        spa: { root: '/var/www' },
        apiRoutes: [
          {
            path: '/test',
            access: 'public',
            handler: async () => ({}),
          },
        ],
      })
    ).not.toThrow();
  });

  it('rejects route without type and without handler', () => {
    expect(() =>
      validateServerConfig({
        spa: { root: '/var/www' },
        apiRoutes: [
          {
            path: '/test',
            access: 'public',
          },
        ],
      })
    ).toThrow('API route requires handler');
  });

  it('rejects private proxy route without auth config', () => {
    expect(() =>
      validateServerConfig({
        spa: { root: '/var/www' },
        proxyRoutes: [
          {
            type: 'proxy',
            path: '/private',
            access: 'private',
            methods: ['get'],
            target: 'https://api.example.com',
          },
        ],
      })
    ).toThrow("security.auth is required when routes have access: 'private'");
  });

  it('accepts private proxy route with auth config', () => {
    expect(() =>
      validateServerConfig({
        spa: { root: '/var/www' },
        proxyRoutes: [
          {
            type: 'proxy',
            path: '/private',
            access: 'private',
            methods: ['get'],
            target: 'https://api.example.com',
          },
        ],
        security: {
          auth: { strategy: 'bearer', secret: () => 'secret' },
        },
      })
    ).not.toThrow();
  });
});
