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

  it('only fetches JWKS once for concurrent requests to same URI', async () => {
    const { jwk } = await import('hono/jwk');
    const mockJwk = vi.mocked(jwk);
    const deferred = { resolved: false };

    mockJwk.mockImplementation(
      (): import('hono').MiddlewareHandler =>
        async (c: import('hono').Context, next: import('hono').Next): Promise<void> => {
          if (!deferred.resolved) {
            await new Promise((r) => setTimeout(r, 50));
            deferred.resolved = true;
          }
          c.set('jwtPayload', { role: 'admin', sub: 'user-123' });
          await next();
        },
    );

    const app = new Hono();

    app.get('/test', async (c) => {
      await extractJwksClaims<TestClaims>(c, 'https://auth.example.com/jwks.json');
      return c.json({});
    });

    app.get('/test2', async (c) => {
      await extractJwksClaims<TestClaims>(c, 'https://auth.example.com/jwks.json');
      return c.json({});
    });

    const req1 = new Request('http://localhost/test', {
      headers: { authorization: 'Bearer some-token' },
    });
    const req2 = new Request('http://localhost/test2', {
      headers: { authorization: 'Bearer some-token' },
    });

    const fetchCountBefore = mockJwk.mock.calls.length;
    const [res1, res2] = await Promise.all([app.fetch(req1), app.fetch(req2)]);
    const fetchCountAfter = mockJwk.mock.calls.length;

    expect(res1.status).toBeLessThan(600);
    expect(res2.status).toBeLessThan(600);
    expect(fetchCountAfter - fetchCountBefore).toBe(1);
  });

  it('passes default RS256 algorithm when not specified', async () => {
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
      result = await extractJwksClaims<TestClaims>(c, 'https://auth-rs256.example.com/jwks.json');
      return c.json({});
    });
    await app.request('/test', { headers: { authorization: 'Bearer some-token' } });

    expect(result).toMatchObject(payload);
    const lastCall = mockJwk.mock.calls.at(-1)!;
    const lastCallArgs = lastCall[0] as { alg: string[]; jwks_uri: string };
    expect(lastCallArgs.alg).toEqual(['RS256']);
    expect(lastCallArgs.jwks_uri).toBe('https://auth-rs256.example.com/jwks.json');
  });

  it('passes custom ES256 algorithm when specified', async () => {
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
      result = await extractJwksClaims<TestClaims>(
        c,
        'https://auth-es256.example.com/jwks.json',
        undefined,
        ['ES256'],
      );
      return c.json({});
    });
    await app.request('/test', { headers: { authorization: 'Bearer some-token' } });

    expect(result).toMatchObject(payload);
    const lastCall = mockJwk.mock.calls.at(-1)!;
    const lastCallArgs = lastCall[0] as { alg: string[]; jwks_uri: string };
    expect(lastCallArgs.alg).toEqual(['ES256']);
    expect(lastCallArgs.jwks_uri).toBe('https://auth-es256.example.com/jwks.json');
  });

  it('passes multiple algorithms when specified', async () => {
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
      result = await extractJwksClaims<TestClaims>(
        c,
        'https://auth-multi.example.com/jwks.json',
        undefined,
        ['RS256', 'ES256'],
      );
      return c.json({});
    });
    await app.request('/test', { headers: { authorization: 'Bearer some-token' } });

    expect(result).toMatchObject(payload);
    const lastCall = mockJwk.mock.calls.at(-1)!;
    const lastCallArgs = lastCall[0] as { alg: string[]; jwks_uri: string };
    expect(lastCallArgs.alg).toEqual(['RS256', 'ES256']);
    expect(lastCallArgs.jwks_uri).toBe('https://auth-multi.example.com/jwks.json');
  });
});
