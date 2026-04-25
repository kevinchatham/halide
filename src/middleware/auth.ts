import type { Context } from 'hono';
import { verify } from 'hono/jwt';

/** Check whether the JWT audience claim matches the expected value. */
function matchesAudience(payload: Record<string, unknown>, audience: string): boolean {
  const aud = payload.aud;
  if (aud === undefined) return false;
  if (typeof aud === 'string') return aud === audience;
  if (Array.isArray(aud)) return aud.includes(audience);
  return false;
}

/**
 * Extract JWT claims from a Bearer token using HS256 verification.
 * @typeParam TClaims - The type of the decoded JWT claims object.
 * @param c - The Hono context.
 * @param secret - The JWT signing secret.
 * @param audience - Optional expected audience claim.
 * @returns The decoded claims or null if extraction fails.
 */
export async function extractBearerClaims<TClaims = unknown>(
  c: Context,
  secret: string,
  audience?: string,
): Promise<TClaims | null> {
  const authHeader = c.req.header('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.slice(7);
  try {
    const payload = await verify(token, secret, 'HS256');
    if (audience && !matchesAudience(payload as Record<string, unknown>, audience)) {
      return null;
    }
    return payload as TClaims;
  } catch {
    return null;
  }
}

/**
 * Extract JWT claims from a Bearer token using JWKS verification.
 * @typeParam TClaims - The type of the decoded JWT claims object.
 * @param c - The Hono context.
 * @param jwksUri - The JWKS endpoint URL.
 * @param audience - Optional expected audience claim.
 * @returns The decoded claims or null if extraction fails.
 */
export async function extractJwksClaims<TClaims = unknown>(
  c: Context,
  jwksUri: string,
  audience?: string,
): Promise<TClaims | null> {
  const authHeader = c.req.header('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }
  const _token = authHeader.slice(7);
  try {
    const { jwk } = await import('hono/jwk');
    const jwkMiddleware = jwk({
      alg: ['RS256'],
      jwks_uri: jwksUri,
    });
    await jwkMiddleware(c, async () => {});
    const payload = c.get('jwtPayload') as TClaims | undefined;
    if (!payload) return null;
    if (audience && !matchesAudience(payload as Record<string, unknown>, audience)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
