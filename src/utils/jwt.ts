import { jwtVerify } from 'jose';

export async function verifyJwt<TClaims = unknown>(
  token: string,
  secret: Uint8Array
): Promise<TClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload as TClaims;
  } catch {
    return null;
  }
}
