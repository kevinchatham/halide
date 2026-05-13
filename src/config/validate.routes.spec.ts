import { validateServerConfig } from './validate';

describe('validateServerConfig — routes', () => {
  it('rejects route path not starting with /', async () => {
    const result = await validateServerConfig({
      apiRoutes: [
        {
          access: 'public',
          handler: async () => ({}),
          path: 'invalid',
          type: 'api',
        },
      ],
      app: { root: '/var/www' },
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: 'Route path must start with / (api): invalid' }),
      ]),
    );
  });

  it('rejects API route without handler', async () => {
    const result = await validateServerConfig({
      apiRoutes: [
        {
          access: 'public',
          path: '/test',
          type: 'api',
        },
      ],
      app: { root: '/var/www' },
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ message: 'API route requires handler' })]),
    );
  });

  it('rejects proxy route without target', async () => {
    const result = await validateServerConfig({
      app: { root: '/var/www' },
      proxyRoutes: [
        {
          access: 'public',
          methods: ['get'],
          path: '/test',
          type: 'proxy',
        },
      ],
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ message: 'Proxy route requires target' })]),
    );
  });

  it('rejects proxy route with empty methods', async () => {
    const result = await validateServerConfig({
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
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: 'Proxy route requires at least one method' }),
      ]),
    );
  });

  it('rejects proxy route with invalid URL', async () => {
    const result = await validateServerConfig({
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
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining('Proxy route target is not a valid URL'),
        }),
      ]),
    );
  });

  it('rejects proxy route with file protocol', async () => {
    const result = await validateServerConfig({
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
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining('Proxy route target is not a valid URL'),
        }),
      ]),
    );
  });

  it('rejects proxy route with data protocol', async () => {
    const result = await validateServerConfig({
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
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining('Proxy route target is not a valid URL'),
        }),
      ]),
    );
  });

  it('rejects proxy route proxyPath not starting with /', async () => {
    const result = await validateServerConfig({
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
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: 'Proxy route proxyPath must start with /: invalid' }),
      ]),
    );
  });

  it('accepts valid proxy route', async () => {
    const result = await validateServerConfig({
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
    });
    expect(result.valid).toBe(true);
  });

  it('treats route without type as API route', async () => {
    const result = await validateServerConfig({
      apiRoutes: [
        {
          access: 'public',
          handler: async () => ({}),
          path: '/test',
        },
      ],
      app: { root: '/var/www' },
    });
    expect(result.valid).toBe(true);
  });

  it('rejects route without type and without handler', async () => {
    const result = await validateServerConfig({
      apiRoutes: [
        {
          access: 'public',
          path: '/test',
        },
      ],
      app: { root: '/var/www' },
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ message: 'API route requires handler' })]),
    );
  });
});
