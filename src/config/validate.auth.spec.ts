import { validateServerConfig } from './validate';

describe('validateServerConfig — auth', () => {
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

  it('rejects negative secretTtl', () => {
    expect(() =>
      validateServerConfig({
        security: {
          auth: { secret: () => 'secret', secretTtl: -1, strategy: 'bearer' },
        },
        spa: { root: '/var/www' },
      }),
    ).toThrow('auth.secretTtl must be a non-negative integer (seconds)');
  });

  it('rejects non-integer secretTtl', () => {
    expect(() =>
      validateServerConfig({
        security: {
          auth: { secret: () => 'secret', secretTtl: 1.5, strategy: 'bearer' },
        },
        spa: { root: '/var/www' },
      }),
    ).toThrow('auth.secretTtl must be a non-negative integer (seconds)');
  });

  it('accepts secretTtl of 0', () => {
    expect(() =>
      validateServerConfig({
        security: {
          auth: { secret: () => 'secret', secretTtl: 0, strategy: 'bearer' },
        },
        spa: { root: '/var/www' },
      }),
    ).not.toThrow();
  });

  it('accepts secretTtl of 60', () => {
    expect(() =>
      validateServerConfig({
        security: {
          auth: { secret: () => 'secret', secretTtl: 60, strategy: 'bearer' },
        },
        spa: { root: '/var/www' },
      }),
    ).not.toThrow();
  });
});
