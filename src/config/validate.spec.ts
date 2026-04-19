import { validateServerConfig } from './validate';

describe('validateServerConfig', () => {
  it('accepts minimal valid config', () => {
    expect(() =>
      validateServerConfig({
        spa: { root: '/var/www' },
      }),
    ).not.toThrow();
  });

  it('accepts full valid config', () => {
    expect(() =>
      validateServerConfig({
        security: {
          auth: { secret: () => 'secret123', strategy: 'bearer' },
          cors: { credentials: true, origin: ['http://localhost:3000'] },
          csp: { directives: { defaultSrc: ["'self'"] } },
        },
        spa: { fallback: 'index.html', name: 'test', root: '/public' },
      }),
    ).not.toThrow();
  });

  it('rejects missing spa.root', () => {
    expect(() =>
      validateServerConfig({
        spa: {},
      }),
    ).toThrow('spa.root is required');
  });

  it('rejects missing spa', () => {
    expect(() => validateServerConfig({})).toThrow('spa.root is required');
  });

  it('rejects route path not starting with /', () => {
    expect(() =>
      validateServerConfig({
        apiRoutes: [
          {
            access: 'public',
            handler: async () => ({}),
            path: 'invalid',
            type: 'api',
          },
        ],
        spa: { root: '/var/www' },
      }),
    ).toThrow('Route path must start with / (api): invalid');
  });

  it('rejects API route without handler', () => {
    expect(() =>
      validateServerConfig({
        apiRoutes: [
          {
            access: 'public',
            path: '/test',
            type: 'api',
          },
        ],
        spa: { root: '/var/www' },
      }),
    ).toThrow('API route requires handler');
  });

  it('rejects proxy route without target', () => {
    expect(() =>
      validateServerConfig({
        proxyRoutes: [
          {
            access: 'public',
            methods: ['get'],
            path: '/test',
            type: 'proxy',
          },
        ],
        spa: { root: '/var/www' },
      }),
    ).toThrow('Proxy route requires target');
  });

  it('rejects proxy route with empty methods', () => {
    expect(() =>
      validateServerConfig({
        proxyRoutes: [
          {
            access: 'public',
            methods: [],
            path: '/test',
            target: 'https://api.example.com',
            type: 'proxy',
          },
        ],
        spa: { root: '/var/www' },
      }),
    ).toThrow('Proxy route requires at least one method');
  });

  it('rejects proxy route proxyPath not starting with /', () => {
    expect(() =>
      validateServerConfig({
        proxyRoutes: [
          {
            access: 'public',
            methods: ['get'],
            path: '/test',
            proxyPath: 'invalid',
            target: 'https://api.example.com',
            type: 'proxy',
          },
        ],
        spa: { root: '/var/www' },
      }),
    ).toThrow('Proxy route proxyPath must start with /: invalid');
  });

  it('rejects wildcard origin with credentials true', () => {
    expect(() =>
      validateServerConfig({
        security: {
          auth: { secret: () => 'secret', strategy: 'bearer' },
          cors: { credentials: true, origin: '*' },
        },
        spa: { root: '/var/www' },
      }),
    ).toThrow('Wildcard origin cannot be used with credentials: true');
  });

  it('rejects wildcard origin in array with credentials true', () => {
    expect(() =>
      validateServerConfig({
        security: {
          auth: { secret: () => 'secret', strategy: 'bearer' },
          cors: { credentials: true, origin: ['http://localhost:3000', '*'] },
        },
        spa: { root: '/var/www' },
      }),
    ).toThrow('Wildcard origin cannot be used with credentials: true');
  });

  it('accepts wildcard origin without credentials', () => {
    expect(() =>
      validateServerConfig({
        security: {
          cors: { credentials: false, origin: '*' },
        },
        spa: { root: '/var/www' },
      }),
    ).not.toThrow();
  });

  it('rejects bearer strategy without secret', () => {
    expect(() =>
      validateServerConfig({
        security: {
          auth: { strategy: 'bearer' },
        },
        spa: { root: '/var/www' },
      }),
    ).toThrow('auth.secret is required when strategy is bearer');
  });

  it('accepts bearer strategy with secret', () => {
    expect(() =>
      validateServerConfig({
        security: {
          auth: { secret: () => 'secret', strategy: 'bearer' },
        },
        spa: { root: '/var/www' },
      }),
    ).not.toThrow();
  });

  it('rejects jwks strategy without jwksUri', () => {
    expect(() =>
      validateServerConfig({
        security: {
          auth: { strategy: 'jwks' },
        },
        spa: { root: '/var/www' },
      }),
    ).toThrow('auth.jwksUri is required when strategy is jwks');
  });

  it('accepts jwks strategy with jwksUri', () => {
    expect(() =>
      validateServerConfig({
        security: {
          auth: {
            jwksUri: 'https://auth.example.com/.well-known/jwks.json',
            strategy: 'jwks',
          },
        },
        spa: { root: '/var/www' },
      }),
    ).not.toThrow();
  });

  it('rejects private routes without auth config', () => {
    expect(() =>
      validateServerConfig({
        apiRoutes: [
          {
            access: 'private',
            handler: async () => ({}),
            path: '/private',
            type: 'api',
          },
        ],
        spa: { root: '/var/www' },
      }),
    ).toThrow("security.auth is required when routes have access: 'private'");
  });

  it('accepts private routes with auth config', () => {
    expect(() =>
      validateServerConfig({
        apiRoutes: [
          {
            access: 'private',
            handler: async () => ({}),
            path: '/private',
            type: 'api',
          },
        ],
        security: {
          auth: { secret: () => 'secret', strategy: 'bearer' },
        },
        spa: { root: '/var/www' },
      }),
    ).not.toThrow();
  });

  it('accepts public routes without auth', () => {
    expect(() =>
      validateServerConfig({
        apiRoutes: [
          {
            access: 'public',
            handler: async () => ({}),
            path: '/public',
            type: 'api',
          },
        ],
        spa: { root: '/var/www' },
      }),
    ).not.toThrow();
  });

  it('accepts valid proxy route', () => {
    expect(() =>
      validateServerConfig({
        proxyRoutes: [
          {
            access: 'public',
            methods: ['get', 'post'],
            path: '/api/users',
            proxyPath: '/users',
            target: 'https://api.example.com',
            timeout: 5000,
            type: 'proxy',
          },
        ],
        spa: { root: '/var/www' },
      }),
    ).not.toThrow();
  });

  it('treats route without type as API route', () => {
    expect(() =>
      validateServerConfig({
        apiRoutes: [
          {
            access: 'public',
            handler: async () => ({}),
            path: '/test',
          },
        ],
        spa: { root: '/var/www' },
      }),
    ).not.toThrow();
  });

  it('rejects route without type and without handler', () => {
    expect(() =>
      validateServerConfig({
        apiRoutes: [
          {
            access: 'public',
            path: '/test',
          },
        ],
        spa: { root: '/var/www' },
      }),
    ).toThrow('API route requires handler');
  });

  it('rejects private proxy route without auth config', () => {
    expect(() =>
      validateServerConfig({
        proxyRoutes: [
          {
            access: 'private',
            methods: ['get'],
            path: '/private',
            target: 'https://api.example.com',
            type: 'proxy',
          },
        ],
        spa: { root: '/var/www' },
      }),
    ).toThrow("security.auth is required when routes have access: 'private'");
  });

  it('accepts private proxy route with auth config', () => {
    expect(() =>
      validateServerConfig({
        proxyRoutes: [
          {
            access: 'private',
            methods: ['get'],
            path: '/private',
            target: 'https://api.example.com',
            type: 'proxy',
          },
        ],
        security: {
          auth: { secret: () => 'secret', strategy: 'bearer' },
        },
        spa: { root: '/var/www' },
      }),
    ).not.toThrow();
  });

  it('rejects kebab-case CSP directive keys', () => {
    expect(() =>
      validateServerConfig({
        security: {
          // @ts-expect-error - intentionally passing kebab-case for runtime validation test
          csp: { directives: { 'default-src': ["'self'"] } },
        },
        spa: { root: '/var/www' },
      }),
    ).toThrow("CSP directive 'default-src' uses kebab-case");
  });
});
