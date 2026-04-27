import { validateServerConfig } from './validate';

describe('validateServerConfig — routes', () => {
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
});
