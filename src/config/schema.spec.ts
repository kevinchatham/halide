import {
  ApiConfigSchema,
  ApiHandlerSchema,
  ApiRouteSchema,
  AppConfigSchema,
  ProxyConfigSchema,
  ProxyRouteSchema,
  ServerConfigSchema,
  SpaConfigSchema,
} from './schema';

describe('SpaConfigSchema', () => {
  it('parses valid spa config', () => {
    const result = SpaConfigSchema.parse({ root: '/var/www' });
    expect(result).toEqual({
      root: '/var/www',
      basePath: '/',
      fallback: 'index.html',
    });
  });

  it('uses defaults for basePath and fallback', () => {
    const result = SpaConfigSchema.parse({ root: '/public' });
    expect(result.basePath).toBe('/');
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

describe('ProxyRouteSchema', () => {
  it('parses valid proxy route', () => {
    const result = ProxyRouteSchema.parse({
      path: '/users',
      access: 'public',
      target: 'https://api.example.com',
    });
    expect(result.access).toBe('public');
  });

  it('rejects invalid access value', () => {
    const result = ProxyRouteSchema.safeParse({
      path: '/users',
      access: 'invalid',
      target: 'https://api.example.com',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid URL for target', () => {
    const result = ProxyRouteSchema.safeParse({
      path: '/users',
      access: 'public',
      target: 'not-a-url',
    });
    expect(result.success).toBe(false);
  });
});

describe('ApiHandlerSchema', () => {
  it('accepts a function', () => {
    const handler = (_req: any, _res: any) => {};
    const result = ApiHandlerSchema.safeParse(handler);
    expect(result.success).toBe(true);
  });

  it('rejects non-function values', () => {
    const result = ApiHandlerSchema.safeParse('not a function');
    expect(result.success).toBe(false);
  });
});

describe('ApiRouteSchema', () => {
  it('parses valid api route', () => {
    const handler = (_req: any, _res: any) => {};
    const result = ApiRouteSchema.parse({
      path: '/data',
      access: 'private',
      handler,
    });
    expect(result.access).toBe('private');
  });
});

describe('ProxyConfigSchema', () => {
  it('uses defaults', () => {
    const result = ProxyConfigSchema.parse({});
    expect(result.basePath).toBe('/api');
    expect(result.routes).toEqual([]);
  });

  it('parses with custom routes', () => {
    const result = ProxyConfigSchema.parse({
      basePath: '/proxy',
      routes: [{ path: '/users', access: 'public', target: 'https://api.example.com' }],
    });
    expect(result.basePath).toBe('/proxy');
    expect(result.routes).toHaveLength(1);
  });
});

describe('ApiConfigSchema', () => {
  it('uses defaults', () => {
    const result = ApiConfigSchema.parse({});
    expect(result.basePath).toBe('/bff');
    expect(result.routes).toEqual([]);
  });
});

describe('AppConfigSchema', () => {
  it('parses valid app config', () => {
    const result = AppConfigSchema.parse({
      spa: { root: '/var/www' },
    });
    expect(result.name).toBe('app');
    expect(result.spa.root).toBe('/var/www');
  });

  it('allows custom name', () => {
    const result = AppConfigSchema.parse({
      name: 'my-app',
      spa: { root: '/var/www' },
    });
    expect(result.name).toBe('my-app');
  });
});

describe('ServerConfigSchema', () => {
  it('parses minimal valid config', () => {
    const result = ServerConfigSchema.parse({
      app: { spa: { root: '/var/www' } },
      auth: { strategy: 'bearer', secret: 'my-secret' },
    });
    expect(result.security).toBeUndefined();
    expect(result.auth.strategy).toBe('bearer');
  });

  it('parses full config', () => {
    const result = ServerConfigSchema.parse({
      app: { name: 'test', spa: { root: '/public', fallback: 'index.html' } },
      proxy: { basePath: '/api', routes: [] },
      api: { basePath: '/bff', routes: [] },
      security: { cors: 'public', csp: 'relaxed' },
      auth: { strategy: 'bearer', secret: 'secret123' },
    });
    expect(result.app.name).toBe('test');
    expect(result.security?.cors).toBe('public');
    expect(result.security?.csp).toBe('relaxed');
  });

  it('requires secret for bearer strategy', () => {
    const result = ServerConfigSchema.safeParse({
      app: { spa: { root: '/var/www' } },
      auth: { strategy: 'bearer' },
    });
    expect(result.success).toBe(false);
  });

  it('allows jwks strategy without secret', () => {
    const result = ServerConfigSchema.parse({
      app: { spa: { root: '/var/www' } },
      auth: { strategy: 'jwks', jwksUri: 'https://auth.example.com/.well-known/jwks.json' },
    });
    expect(result.auth.strategy).toBe('jwks');
  });

  it('rejects invalid cors value', () => {
    const result = ServerConfigSchema.safeParse({
      app: { spa: { root: '/var/www' } },
      auth: { strategy: 'bearer', secret: 'secret' },
      security: { cors: 'invalid' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid csp value', () => {
    const result = ServerConfigSchema.safeParse({
      app: { spa: { root: '/var/www' } },
      auth: { strategy: 'bearer', secret: 'secret' },
      security: { cors: 'internal', csp: 'invalid' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty secret', () => {
    const result = ServerConfigSchema.safeParse({
      app: { spa: { root: '/var/www' } },
      auth: { strategy: 'bearer', secret: '' },
    });
    expect(result.success).toBe(false);
  });
});
