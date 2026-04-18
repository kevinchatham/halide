import { jwtVerify } from 'jose';

export async function verifyJwt<TClaims = unknown>(
  token: string,
  secret: Uint8Array,
  options?: { audience?: string }
): Promise<TClaims | null> {
  try {
    const { payload } = await jwtVerify(
      token,
      secret,
      options?.audience ? { audience: options.audience } : undefined
    );
    return payload as TClaims;
  } catch {
    return null;
  }
}
