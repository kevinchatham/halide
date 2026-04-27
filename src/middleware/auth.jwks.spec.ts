import { Hono } from 'hono';
import { extractJwksClaims } from './auth';

vi.mock('hono/jwk', () => ({
  jwk: vi.fn(),
}));

interface TestClaims {
  role: string;
  sub: string;
}

describe('extractJwksClaims', () => {
  it('returns null when authorization header is missing', async () => {
    const app = new Hono();
    let result: TestClaims | null = 'sentinel' as unknown as TestClaims | null;
    app.get('/test', async (c) => {
      result = await extractJwksClaims<TestClaims>(c, 'https://auth.example.com/jwks.json');
      return c.json({});
    });
    await app.request('/test');
    expect(result).toBeNull();
  });

  it('returns null when authorization header does not start with Bearer', async () => {
    const app = new Hono();
    let result: TestClaims | null = 'sentinel' as unknown as TestClaims | null;
    app.get('/test', async (c) => {
      result = await extractJwksClaims<TestClaims>(c, 'https://auth.example.com/jwks.json');
      return c.json({});
    });
    await app.request('/test', { headers: { authorization: 'Basic abc123' } });
    expect(result).toBeNull();
  });

  it('returns null when JWKS verification fails', async () => {
    const app = new Hono();
    let result: TestClaims | null = 'sentinel' as unknown as TestClaims | null;
    app.get('/test', async (c) => {
      result = await extractJwksClaims<TestClaims>(c, 'https://auth.example.com/jwks.json');
      return c.json({});
    });
    await app.request('/test', { headers: { authorization: 'Bearer invalid-token' } });
    expect(result).toBeNull();
  });

  it('returns null when JWKS verification fails with audience parameter', async () => {
    const app = new Hono();
    let result: TestClaims | null = 'sentinel' as unknown as TestClaims | null;
    app.get('/test', async (c) => {
      result = await extractJwksClaims<TestClaims>(
        c,
        'https://auth.example.com/jwks.json',
        'my-api',
      );
      return c.json({});
    });
    await app.request('/test', { headers: { authorization: 'Bearer some-token' } });
    expect(result).toBeNull();
  });

  it('returns claims when JWKS verification succeeds without audience', async () => {
    const { jwk } = await import('hono/jwk');
    const mockJwk = vi.mocked(jwk);
    const payload = { role: 'admin', sub: 'user-123' };
    mockJwk.mockImplementation((): import('hono').MiddlewareHandler => {
      return async (c: import('hono').Context, next: import('hono').Next) => {
        c.set('jwtPayload', payload);
        await next();
      };
    });

    const app = new Hono();
    let result: TestClaims | null = null;
    app.get('/test', async (c) => {
      result = await extractJwksClaims<TestClaims>(c, 'https://auth.example.com/jwks.json');
      return c.json({});
    });
    await app.request('/test', { headers: { authorization: 'Bearer some-token' } });
    expect(result).toMatchObject(payload);
  });

  it('returns claims when JWKS verification succeeds and audience matches string aud', async () => {
    const { jwk } = await import('hono/jwk');
    const mockJwk = vi.mocked(jwk);
    const payload = { aud: 'my-api', sub: 'user-123' };
    mockJwk.mockImplementation((): import('hono').MiddlewareHandler => {
      return async (c: import('hono').Context, next: import('hono').Next) => {
        c.set('jwtPayload', payload);
        await next();
      };
    });

    const app = new Hono();
    let result: TestClaims | null = null;
    app.get('/test', async (c) => {
      result = await extractJwksClaims<TestClaims>(
        c,
        'https://auth.example.com/jwks.json',
        'my-api',
      );
      return c.json({});
    });
    await app.request('/test', { headers: { authorization: 'Bearer some-token' } });
    expect(result).toMatchObject(payload);
  });

  it('returns null when JWKS verification succeeds but audience does not match', async () => {
    const { jwk } = await import('hono/jwk');
    const mockJwk = vi.mocked(jwk);
    const payload = { aud: 'wrong-audience', sub: 'user-123' };
    mockJwk.mockImplementation((): import('hono').MiddlewareHandler => {
      return async (c: import('hono').Context, next: import('hono').Next) => {
        c.set('jwtPayload', payload);
        await next();
      };
    });

    const app = new Hono();
    let result: TestClaims | null = 'sentinel' as unknown as TestClaims | null;
    app.get('/test', async (c) => {
      result = await extractJwksClaims<TestClaims>(
        c,
        'https://auth.example.com/jwks.json',
        'my-api',
      );
      return c.json({});
    });
    await app.request('/test', { headers: { authorization: 'Bearer some-token' } });
    expect(result).toBeNull();
  });

  it('returns null when JWKS verification succeeds but jwtPayload is not set', async () => {
    const { jwk } = await import('hono/jwk');
    const mockJwk = vi.mocked(jwk);
    mockJwk.mockImplementation((): import('hono').MiddlewareHandler => {
      return async (_c: import('hono').Context, next: import('hono').Next) => {
        await next();
      };
    });

    const app = new Hono();
    let result: TestClaims | null = 'sentinel' as unknown as TestClaims | null;
    app.get('/test', async (c) => {
      result = await extractJwksClaims<TestClaims>(c, 'https://auth.example.com/jwks.json');
      return c.json({});
    });
    await app.request('/test', { headers: { authorization: 'Bearer some-token' } });
    expect(result).toBeNull();
  });

  it('returns claims when JWKS verification succeeds and audience matches array aud', async () => {
    const { jwk } = await import('hono/jwk');
    const mockJwk = vi.mocked(jwk);
    const payload = { aud: ['my-api', 'other-api'], sub: 'user-123' };
    mockJwk.mockImplementation((): import('hono').MiddlewareHandler => {
      return async (c: import('hono').Context, next: import('hono').Next) => {
        c.set('jwtPayload', payload);
        await next();
      };
    });

    const app = new Hono();
    let result: TestClaims | null = null;
    app.get('/test', async (c) => {
      result = await extractJwksClaims<TestClaims>(
        c,
        'https://auth.example.com/jwks.json',
        'my-api',
      );
      return c.json({});
    });
    await app.request('/test', { headers: { authorization: 'Bearer some-token' } });
    expect(result).toMatchObject(payload);
  });
});
