import { sign } from 'hono/jwt';
import { buildHonoApp } from '../utils/hono';
import { extractBearerClaims } from './auth';

vi.mock('hono/jwk', () => ({
  jwk: vi.fn(),
}));

const secret = 'test-secret';

interface TestClaims {
  role: string;
  sub: string;
}

async function createValidToken(claims: Record<string, unknown>): Promise<string> {
  return sign(claims, secret, 'HS256');
}

describe('extractBearerClaims', () => {
  it('returns null when aud is a non-string non-array type', async () => {
    const app = buildHonoApp();
    const token = await createValidToken({ aud: 42, sub: 'user-123' });
    let result: TestClaims | null = 'sentinel' as unknown as TestClaims | null;
    app.get('/test', async (c) => {
      result = await extractBearerClaims<TestClaims>(c, secret, '42');
      return c.json({});
    });
    await app.request('/test', { headers: { authorization: `Bearer ${token}` } });
    expect(result).toBeNull();
  });

  it('returns null when authorization header is missing', async () => {
    const app = buildHonoApp();
    let result: TestClaims | null = 'sentinel' as unknown as TestClaims | null;
    app.get('/test', async (c) => {
      result = await extractBearerClaims<TestClaims>(c, secret);
      return c.json({});
    });
    await app.request('/test');
    expect(result).toBeNull();
  });

  it('returns null when authorization header does not start with Bearer', async () => {
    const app = buildHonoApp();
    let result: TestClaims | null = 'sentinel' as unknown as TestClaims | null;
    app.get('/test', async (c) => {
      result = await extractBearerClaims<TestClaims>(c, secret);
      return c.json({});
    });
    await app.request('/test', { headers: { authorization: 'Basic abc123' } });
    expect(result).toBeNull();
  });

  it('returns null when token is invalid', async () => {
    const app = buildHonoApp();
    let result: TestClaims | null = 'sentinel' as unknown as TestClaims | null;
    app.get('/test', async (c) => {
      result = await extractBearerClaims<TestClaims>(c, secret);
      return c.json({});
    });
    await app.request('/test', { headers: { authorization: 'Bearer invalid-token' } });
    expect(result).toBeNull();
  });

  it('returns claims with valid token', async () => {
    const app = buildHonoApp();
    const claims = { role: 'admin', sub: 'user-123' };
    const token = await createValidToken(claims);
    let result: TestClaims | null = null;
    app.get('/test', async (c) => {
      result = await extractBearerClaims<TestClaims>(c, secret);
      return c.json({});
    });
    await app.request('/test', { headers: { authorization: `Bearer ${token}` } });
    expect(result).toMatchObject(claims);
  });

  it('returns null when audience does not match', async () => {
    const app = buildHonoApp();
    const token = await createValidToken({ aud: 'wrong-audience', sub: 'user-123' });
    let result: TestClaims | null = 'sentinel' as unknown as TestClaims | null;
    app.get('/test', async (c) => {
      result = await extractBearerClaims<TestClaims>(c, secret, 'my-api');
      return c.json({});
    });
    await app.request('/test', { headers: { authorization: `Bearer ${token}` } });
    expect(result).toBeNull();
  });

  it('returns claims when audience matches string aud', async () => {
    const app = buildHonoApp();
    const claims = { aud: 'my-api', sub: 'user-123' };
    const token = await createValidToken(claims);
    let result: TestClaims | null = null;
    app.get('/test', async (c) => {
      result = await extractBearerClaims<TestClaims>(c, secret, 'my-api');
      return c.json({});
    });
    await app.request('/test', { headers: { authorization: `Bearer ${token}` } });
    expect(result).toMatchObject(claims);
  });

  it('returns claims when audience matches array aud', async () => {
    const app = buildHonoApp();
    const claims = { aud: ['my-api', 'other-api'], sub: 'user-123' };
    const token = await createValidToken(claims);
    let result: TestClaims | null = null;
    app.get('/test', async (c) => {
      result = await extractBearerClaims<TestClaims>(c, secret, 'my-api');
      return c.json({});
    });
    await app.request('/test', { headers: { authorization: `Bearer ${token}` } });
    expect(result).toMatchObject(claims);
  });

  it('returns null when token has no aud but audience is required', async () => {
    const app = buildHonoApp();
    const token = await createValidToken({ sub: 'user-123' });
    let result: TestClaims | null = 'sentinel' as unknown as TestClaims | null;
    app.get('/test', async (c) => {
      result = await extractBearerClaims<TestClaims>(c, secret, 'my-api');
      return c.json({});
    });
    await app.request('/test', { headers: { authorization: `Bearer ${token}` } });
    expect(result).toBeNull();
  });

  it('extracts token correctly from Bearer header', async () => {
    const app = buildHonoApp();
    const claims = { sub: 'test' };
    const token = await createValidToken(claims);
    let result: TestClaims | null = null;
    app.get('/test', async (c) => {
      result = await extractBearerClaims<TestClaims>(c, secret);
      return c.json({});
    });
    await app.request('/test', { headers: { authorization: `Bearer ${token}` } });
    expect(result).toMatchObject(claims);
  });
});
