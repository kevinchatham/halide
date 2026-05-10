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
        app: { root: '/var/www' },
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
        app: { root: '/var/www' },
      }),
    ).toThrow('API route requires handler');
  });

  it('rejects proxy route without target', () => {
    expect(() =>
      validateServerConfig({
        app: { root: '/var/www' },
        proxyRoutes: [
          {
            access: 'public',
            methods: ['get'],
            path: '/test',
            type: 'proxy',
          },
        ],
      }),
    ).toThrow('Proxy route requires target');
  });

  it('rejects proxy route with empty methods', () => {
    expect(() =>
      validateServerConfig({
        app: { root: '/var/www' },
        proxyRoutes: [
          {
            access: 'public',
            methods: [],
            path: '/test',
            target: 'https://api.example.com',
            type: 'proxy',
          },
        ],
      }),
    ).toThrow('Proxy route requires at least one method');
  });

  it('rejects proxy route with invalid URL', () => {
    expect(() =>
      validateServerConfig({
        app: { root: '/var/www' },
        proxyRoutes: [
          {
            access: 'public',
            methods: ['get'],
            path: '/test',
            target: 'not a url',
            type: 'proxy',
          },
        ],
      }),
    ).toThrow('Proxy route target is not a valid URL');
  });

  it('rejects proxy route with file protocol', () => {
    expect(() =>
      validateServerConfig({
        app: { root: '/var/www' },
        proxyRoutes: [
          {
            access: 'public',
            methods: ['get'],
            path: '/test',
            target: 'file:///etc/passwd',
            type: 'proxy',
          },
        ],
      }),
    ).toThrow('Proxy route target is not a valid URL');
  });

  it('rejects proxy route with data protocol', () => {
    expect(() =>
      validateServerConfig({
        app: { root: '/var/www' },
        proxyRoutes: [
          {
            access: 'public',
            methods: ['get'],
            path: '/test',
            target: 'data:text/html,<h1>Hello</h1>',
            type: 'proxy',
          },
        ],
      }),
    ).toThrow('Proxy route target is not a valid URL');
  });

  it('rejects proxy route proxyPath not starting with /', () => {
    expect(() =>
      validateServerConfig({
        app: { root: '/var/www' },
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
      }),
    ).toThrow('Proxy route proxyPath must start with /: invalid');
  });

  it('accepts valid proxy route', () => {
    expect(() =>
      validateServerConfig({
        app: { root: '/var/www' },
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
        app: { root: '/var/www' },
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
        app: { root: '/var/www' },
      }),
    ).toThrow('API route requires handler');
  });
});
