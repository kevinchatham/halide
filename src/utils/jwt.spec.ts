import { SignJWT } from 'jose';
import { verifyJwt } from './jwt';

const secret = new TextEncoder().encode('test-secret');

async function createValidToken(claims: Record<string, unknown>): Promise<string> {
  return new SignJWT(claims).setProtectedHeader({ alg: 'HS256' }).sign(secret);
}

describe('verifyJwt', () => {
  it('returns null for invalid token', async () => {
    const result = await verifyJwt('invalid-token', secret);
    expect(result).toBeNull();
  });

  it('returns claims for valid token', async () => {
    const token = await createValidToken({ sub: 'user-123', role: 'admin' });
    const result = await verifyJwt<{ sub: string; role: string }>(token, secret);
    expect(result).toMatchObject({ sub: 'user-123', role: 'admin' });
  });
});
