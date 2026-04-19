import type { Request, Response } from 'express';
import { SignJWT } from 'jose';
import { verifyJwt } from '../utils/jwt';
import { createAuthMiddleware, createJwksAuthMiddleware } from './auth';

vi.mock('../utils/jwt', () => ({
  verifyJwt: vi.fn(),
}));

const mockJwksVerify: ReturnType<typeof vi.fn> = vi.fn();
vi.mock('jose', async (importOriginal) => {
  const actual = await importOriginal<typeof import('jose')>();
  return {
    ...actual,
    createRemoteJWKSet: vi.fn(() => mockJwksVerify),
    jwtVerify: vi.fn(async (token: string, JWKS: (...args: unknown[]) => unknown) => {
      return JWKS(token);
    }),
  };
});

const secret: Uint8Array = new TextEncoder().encode('test-secret');

interface TestClaims {
  role: string;
  sub: string;
}

async function _createValidToken(claims: Record<string, unknown>): Promise<string> {
  return new SignJWT(claims as unknown as import('jose').JWTPayload)
    .setProtectedHeader({ alg: 'HS256' })
    .sign(secret);
}

describe('createAuthMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when authorization header is missing', () => {
    const handler = createAuthMiddleware<TestClaims>(secret);

    const req = { headers: {} } as unknown as Request;
    const res = {
      json: vi.fn().mockReturnThis(),
      status: vi.fn().mockReturnThis(),
    } as unknown as Response;
    const next = vi.fn();

    handler(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when authorization header does not start with Bearer', () => {
    const handler = createAuthMiddleware<TestClaims>(secret);

    const req = { headers: { authorization: 'Basic abc123' } } as unknown as Request;
    const res = {
      json: vi.fn().mockReturnThis(),
      status: vi.fn().mockReturnThis(),
    } as unknown as Response;
    const next = vi.fn();

    handler(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when verifyJwt returns null', async () => {
    vi.mocked(verifyJwt).mockResolvedValue(null);

    const handler = createAuthMiddleware<TestClaims>(secret);

    const req = { headers: { authorization: 'Bearer invalid-token' } } as unknown as Request;
    const res = {
      json: vi.fn().mockReturnThis(),
      status: vi.fn().mockReturnThis(),
    } as unknown as Response;
    const next = vi.fn();

    handler(req, res, next);

    await vi.waitFor(() => {
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
      expect(next).not.toHaveBeenCalled();
    });
  });

  it('calls next with valid token and attaches claims', async () => {
    const claims = { role: 'admin', sub: 'user-123' };
    vi.mocked(verifyJwt).mockResolvedValue(claims);

    const handler = createAuthMiddleware<TestClaims>(secret);

    const req = { headers: { authorization: 'Bearer valid-token' } } as unknown as Request;
    const res = {
      json: vi.fn().mockReturnThis(),
      status: vi.fn().mockReturnThis(),
    } as unknown as Response;
    const next = vi.fn();

    handler(req, res, next);

    await vi.waitFor(() => {
      expect(verifyJwt).toHaveBeenCalledWith('valid-token', secret, undefined);
      expect(req.claims).toEqual(claims);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  it('returns 401 when verifyJwt throws', async () => {
    vi.mocked(verifyJwt).mockRejectedValue(new Error('Verification failed'));

    const handler = createAuthMiddleware<TestClaims>(secret);

    const req = { headers: { authorization: 'Bearer bad-token' } } as unknown as Request;
    const res = {
      json: vi.fn().mockReturnThis(),
      status: vi.fn().mockReturnThis(),
    } as unknown as Response;
    const next = vi.fn();

    handler(req, res, next);

    await vi.waitFor(() => {
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
      expect(next).not.toHaveBeenCalled();
    });
  });

  it('extracts token correctly from Bearer header', async () => {
    vi.mocked(verifyJwt).mockResolvedValue({ sub: 'test' });

    const handler = createAuthMiddleware(secret);

    const req = { headers: { authorization: 'Bearer my-token-here' } } as unknown as Request;
    const res = {
      json: vi.fn().mockReturnThis(),
      status: vi.fn().mockReturnThis(),
    } as unknown as Response;
    const next = vi.fn();

    handler(req, res, next);

    await vi.waitFor(() => {
      expect(verifyJwt).toHaveBeenCalledWith('my-token-here', secret, undefined);
    });
  });
});

describe('createJwksAuthMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when authorization header is missing', () => {
    const handler = createJwksAuthMiddleware<TestClaims>('https://auth.example.com/jwks.json');

    const req = { headers: {} } as unknown as Request;
    const res = {
      json: vi.fn().mockReturnThis(),
      status: vi.fn().mockReturnThis(),
    } as unknown as Response;
    const next = vi.fn();

    handler(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when authorization header does not start with Bearer', () => {
    const handler = createJwksAuthMiddleware<TestClaims>('https://auth.example.com/jwks.json');

    const req = { headers: { authorization: 'Basic abc123' } } as unknown as Request;
    const res = {
      json: vi.fn().mockReturnThis(),
      status: vi.fn().mockReturnThis(),
    } as unknown as Response;
    const next = vi.fn();

    handler(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next with valid token and attaches claims', async () => {
    mockJwksVerify.mockResolvedValueOnce({
      payload: { role: 'admin', sub: 'user-123' },
      protectedHeader: { alg: 'RS256' },
    });

    const handler = createJwksAuthMiddleware<TestClaims>('https://auth.example.com/jwks.json');

    const req = { headers: { authorization: 'Bearer valid-token' } } as unknown as Request;
    const res = {
      json: vi.fn().mockReturnThis(),
      status: vi.fn().mockReturnThis(),
    } as unknown as Response;
    const next = vi.fn();

    await handler(req, res, next);

    expect(req.claims).toEqual({ role: 'admin', sub: 'user-123' });
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns 401 when JWKS verification fails', async () => {
    mockJwksVerify.mockRejectedValueOnce(new Error('Invalid token'));

    const handler = createJwksAuthMiddleware<TestClaims>('https://auth.example.com/jwks.json');

    const req = { headers: { authorization: 'Bearer invalid-token' } } as unknown as Request;
    const res = {
      json: vi.fn().mockReturnThis(),
      status: vi.fn().mockReturnThis(),
    } as unknown as Response;
    const next = vi.fn();

    await handler(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
    expect(next).not.toHaveBeenCalled();
  });
});
