import { validateServerConfig } from './validate';

describe('validateServerConfig — auth', () => {
  it('rejects bearer strategy without secret', () => {
    expect(() =>
      validateServerConfig({
        app: { root: '/var/www' },
        security: {
          auth: { strategy: 'bearer' },
        },
      }),
    ).toThrow('auth.secret is required when strategy is bearer');
  });

  it('accepts bearer strategy with secret', () => {
    expect(() =>
      validateServerConfig({
        app: { root: '/var/www' },
        security: {
          auth: { secret: () => 'secret', strategy: 'bearer' },
        },
      }),
    ).not.toThrow();
  });

  it('rejects jwks strategy without jwksUri', () => {
    expect(() =>
      validateServerConfig({
        app: { root: '/var/www' },
        security: {
          auth: { strategy: 'jwks' },
        },
      }),
    ).toThrow('auth.jwksUri is required when strategy is jwks');
  });

  it('accepts jwks strategy with jwksUri', () => {
    expect(() =>
      validateServerConfig({
        app: { root: '/var/www' },
        security: {
          auth: {
            jwksUri: 'https://auth.example.com/.well-known/jwks.json',
            strategy: 'jwks',
          },
        },
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
        app: { root: '/var/www' },
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
        app: { root: '/var/www' },
        security: {
          auth: { secret: () => 'secret', strategy: 'bearer' },
        },
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
        app: { root: '/var/www' },
      }),
    ).not.toThrow();
  });

  it('rejects private proxy route without auth config', () => {
    expect(() =>
      validateServerConfig({
        app: { root: '/var/www' },
        proxyRoutes: [
          {
            access: 'private',
            methods: ['get'],
            path: '/private',
            target: 'https://api.example.com',
            type: 'proxy',
          },
        ],
      }),
    ).toThrow("security.auth is required when routes have access: 'private'");
  });

  it('accepts private proxy route with auth config', () => {
    expect(() =>
      validateServerConfig({
        app: { root: '/var/www' },
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
      }),
    ).not.toThrow();
  });

  it('rejects negative secretTtl', () => {
    expect(() =>
      validateServerConfig({
        app: { root: '/var/www' },
        security: {
          auth: { secret: () => 'secret', secretTtl: -1, strategy: 'bearer' },
        },
      }),
    ).toThrow('auth.secretTtl must be a non-negative integer (seconds)');
  });

  it('rejects non-integer secretTtl', () => {
    expect(() =>
      validateServerConfig({
        app: { root: '/var/www' },
        security: {
          auth: { secret: () => 'secret', secretTtl: 1.5, strategy: 'bearer' },
        },
      }),
    ).toThrow('auth.secretTtl must be a non-negative integer (seconds)');
  });

  it('accepts secretTtl of 0', () => {
    expect(() =>
      validateServerConfig({
        app: { root: '/var/www' },
        security: {
          auth: { secret: () => 'secret', secretTtl: 0, strategy: 'bearer' },
        },
      }),
    ).not.toThrow();
  });

  it('accepts secretTtl of 60', () => {
    expect(() =>
      validateServerConfig({
        app: { root: '/var/www' },
        security: {
          auth: { secret: () => 'secret', secretTtl: 60, strategy: 'bearer' },
        },
      }),
    ).not.toThrow();
  });
});

describe('validateServerConfig — auth warnings', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('warns when algorithms is set with jwks strategy', () => {
    expect(() =>
      validateServerConfig({
        app: { root: '/var/www' },
        security: {
          auth: {
            algorithms: ['RS256'],
            jwksUri: 'https://auth.example.com/.well-known/jwks.json',
            strategy: 'jwks',
          },
        },
      }),
    ).not.toThrow();

    // biome-ignore lint/suspicious/noConsole: test mocking for config warnings
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('auth.algorithms is ignored when strategy is jwks'),
    );
  });

  it('does not warn when algorithms is set with bearer strategy', () => {
    expect(() =>
      validateServerConfig({
        app: { root: '/var/www' },
        security: {
          auth: {
            algorithms: ['HS256'],
            secret: () => 'secret',
            strategy: 'bearer',
          },
        },
      }),
    ).not.toThrow();

    // biome-ignore lint/suspicious/noConsole: test mocking for config warnings
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('does not warn when algorithms is not set', () => {
    expect(() =>
      validateServerConfig({
        app: { root: '/var/www' },
        security: {
          auth: {
            jwksUri: 'https://auth.example.com/.well-known/jwks.json',
            strategy: 'jwks',
          },
        },
      }),
    ).not.toThrow();

    // biome-ignore lint/suspicious/noConsole: test mocking for config warnings
    expect(console.warn).not.toHaveBeenCalled();
  });
});
