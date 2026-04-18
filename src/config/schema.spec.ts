import {
  ApiRouteSchema,
  PathSchema,
  ProxyRouteSchema,
  RequestContextSchema,
  ServerConfigSchema,
  SpaConfigSchema,
} from './schema';

describe('SpaConfigSchema', () => {
  it('parses valid spa config', () => {
    const result = SpaConfigSchema.parse({ root: '/var/www' });
    expect(result).toEqual({
      name: 'app',
      root: '/var/www',
      fallback: 'index.html',
    });
  });

  it('uses defaults for name and fallback', () => {
    const result = SpaConfigSchema.parse({ root: '/public' });
    expect(result.name).toBe('app');
    expect(result.fallback).toBe('index.html');
  });

  it('allows custom fallback', () => {
    const result = SpaConfigSchema.parse({ root: '/public', fallback: 'app.html' });
    expect(result.fallback).toBe('app.html');
  });

  it('rejects missing root', () => {
    const result = SpaConfigSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe('PathSchema', () => {
  it('accepts valid paths starting with /', () => {
    expect(PathSchema.parse('/')).toBe('/');
    expect(PathSchema.parse('/users')).toBe('/users');
    expect(PathSchema.parse('/api/v1/data')).toBe('/api/v1/data');
  });

  it('rejects empty strings', () => {
    expect(PathSchema.safeParse('').success).toBe(false);
  });

  it('rejects paths not starting with /', () => {
    expect(PathSchema.safeParse('users').success).toBe(false);
    expect(PathSchema.safeParse('api/data').success).toBe(false);
  });
});

describe('RequestContextSchema', () => {
  it('parses headers with string values', () => {
    const result = RequestContextSchema.parse({
      method: 'get',
      path: '/test',
      headers: { 'content-type': 'application/json' },
    });
    expect(result.headers['content-type']).toBe('application/json');
  });

  it('parses headers with array values', () => {
    const result = RequestContextSchema.parse({
      method: 'get',
      path: '/test',
      headers: { 'set-cookie': ['cookie1=value1', 'cookie2=value2'] },
    });
    expect(result.headers['set-cookie']).toEqual(['cookie1=value1', 'cookie2=value2']);
  });

  it('parses query params with string values', () => {
    const result = RequestContextSchema.parse({
      method: 'get',
      path: '/test',
      headers: {},
      query: { foo: 'bar' },
    });
    expect(result.query['foo']).toBe('bar');
  });

  it('parses query params with array values', () => {
    const result = RequestContextSchema.parse({
      method: 'get',
      path: '/test',
      headers: {},
      query: { tags: ['a', 'b', 'c'] },
    });
    expect(result.query['tags']).toEqual(['a', 'b', 'c']);
  });

  it('defaults query to empty object', () => {
    const result = RequestContextSchema.parse({
      method: 'get',
      path: '/test',
      headers: {},
    });
    expect(result.query).toEqual({});
  });
});

describe('ProxyRouteSchema', () => {
  it('parses valid proxy route', () => {
    const result = ProxyRouteSchema.parse({
      type: 'proxy',
      path: '/users',
      access: 'public',
      methods: ['get'],
      target: 'https://api.example.com',
      proxyPath: '/api/users',
    });
    expect(result.access).toBe('public');
    expect(result.methods).toEqual(['get']);
  });

  it('rejects invalid access value', () => {
    const result = ProxyRouteSchema.safeParse({
      type: 'proxy',
      path: '/users',
      access: 'invalid',
      methods: ['get'],
      target: 'https://api.example.com',
      proxyPath: '/api/users',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid URL for target', () => {
    const result = ProxyRouteSchema.safeParse({
      type: 'proxy',
      path: '/users',
      access: 'public',
      methods: ['get'],
      target: 'not-a-url',
      proxyPath: '/api/users',
    });
    expect(result.success).toBe(false);
  });

  it('rejects proxyPath not starting with /', () => {
    const result = ProxyRouteSchema.safeParse({
      type: 'proxy',
      path: '/users',
      access: 'public',
      methods: ['get'],
      target: 'https://api.example.com',
      proxyPath: 'api/users',
    });
    expect(result.success).toBe(false);
  });

  it('requires methods field', () => {
    const result = ProxyRouteSchema.safeParse({
      type: 'proxy',
      path: '/users',
      access: 'public',
      target: 'https://api.example.com',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty methods array', () => {
    const result = ProxyRouteSchema.safeParse({
      type: 'proxy',
      path: '/users',
      access: 'public',
      methods: [],
      target: 'https://api.example.com',
    });
    expect(result.success).toBe(false);
  });

  it('rejects path not starting with /', () => {
    const result = ProxyRouteSchema.safeParse({
      type: 'proxy',
      path: 'users',
      access: 'public',
      methods: ['get'],
      target: 'https://api.example.com',
    });
    expect(result.success).toBe(false);
  });
});

describe('ApiRouteSchema', () => {
  it('parses valid api route', () => {
    const handler = async (_req: any, _res: any) => {};
    const result = ApiRouteSchema.parse({
      type: 'api',
      path: '/data',
      access: 'private',
      handler,
    });
    expect(result.access).toBe('private');
  });

  it('rejects path not starting with /', () => {
    const handler = async (_req: any, _res: any) => {};
    const result = ApiRouteSchema.safeParse({
      type: 'api',
      path: 'data',
      access: 'private',
      handler,
    });
    expect(result.success).toBe(false);
  });
});

describe('ServerConfigSchema', () => {
  it('parses minimal valid config', () => {
    const result = ServerConfigSchema.parse({
      spa: { root: '/var/www' },
    });
    expect(result.spa.root).toBe('/var/www');
  });

  it('parses full config', () => {
    const result = ServerConfigSchema.parse({
      spa: { name: 'test', root: '/public', fallback: 'index.html' },
      security: {
        cors: { origin: ['http://localhost:3000'], credentials: true },
        csp: { 'default-src': ["'self'"] },
        auth: { strategy: 'bearer', secret: 'secret123' },
      },
    });
    expect(result.spa.name).toBe('test');
    expect(result.security?.cors?.origin).toEqual(['http://localhost:3000']);
    expect(result.security?.cors?.credentials).toBe(true);
  });

  it('rejects wildcard origin with credentials', () => {
    const result = ServerConfigSchema.safeParse({
      spa: { root: '/var/www' },
      security: {
        cors: { origin: '*', credentials: true },
        auth: { strategy: 'bearer', secret: 'secret' },
      },
    });
    expect(result.success).toBe(false);
  });

  it('requires secret for bearer strategy', () => {
    const result = ServerConfigSchema.safeParse({
      spa: { root: '/var/www' },
      security: { auth: { strategy: 'bearer' } },
    });
    expect(result.success).toBe(false);
  });

  it('allows jwks strategy without secret', () => {
    const result = ServerConfigSchema.parse({
      spa: { root: '/var/www' },
      security: {
        auth: { strategy: 'jwks', jwksUri: 'https://auth.example.com/.well-known/jwks.json' },
      },
    });
    expect(result.security?.auth?.strategy).toBe('jwks');
  });

  it('rejects invalid cors value', () => {
    const result = ServerConfigSchema.safeParse({
      spa: { root: '/var/www' },
      security: { cors: { origin: 123 }, auth: { strategy: 'bearer', secret: 'secret' } },
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty secret', () => {
    const result = ServerConfigSchema.safeParse({
      spa: { root: '/var/www' },
      security: { auth: { strategy: 'bearer', secret: '' } },
    });
    expect(result.success).toBe(false);
  });

  it('requires auth when routes have private access', () => {
    const result = ServerConfigSchema.safeParse({
      spa: { root: '/var/www' },
      routes: [
        {
          type: 'api',
          path: '/private',
          access: 'private',
          method: 'get',
          handler: async () => ({}),
        },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors.some((e) => e.message.includes('security.auth is required'))).toBe(
        true
      );
    }
  });

  it('allows private routes when auth is defined', () => {
    const result = ServerConfigSchema.safeParse({
      spa: { root: '/var/www' },
      routes: [
        {
          type: 'api',
          path: '/private',
          access: 'private',
          method: 'get',
          handler: async () => ({}),
        },
      ],
      security: {
        auth: { strategy: 'bearer', secret: 'secret' },
      },
    });
    expect(result.success).toBe(true);
  });

  it('allows public routes without auth', () => {
    const result = ServerConfigSchema.safeParse({
      spa: { root: '/var/www' },
      routes: [
        {
          type: 'api',
          path: '/public',
          access: 'public',
          method: 'get',
          handler: async () => ({}),
        },
      ],
    });
    expect(result.success).toBe(true);
  });
});
