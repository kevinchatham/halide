import type { RequestHandler } from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { verifyJwt } from '../utils/jwt';

const unauthorized = { error: 'Unauthorized' };

export function createAuthMiddleware<TClaims = unknown>(secret: Uint8Array): RequestHandler {
  return (req, res, next) => {
    const authHeader: string | undefined = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json(unauthorized);
      return;
    }
    const token = authHeader.slice(7);
    verifyJwt<TClaims>(token, secret)
      .then((claims) => {
        if (!claims) {
          res.status(401).json(unauthorized);
          return;
        }
        req.claims = claims;
        next();
      })
      .catch(() => {
        res.status(401).json(unauthorized);
      });
  };
}

export function createJwksAuthMiddleware<TClaims = unknown>(jwksUri: string): RequestHandler {
  const JWKS = createRemoteJWKSet(new URL(jwksUri));

  return async (req, res, next) => {
    const authHeader: string | undefined = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json(unauthorized);
      return;
    }
    const token = authHeader.slice(7);
    try {
      const { payload } = await jwtVerify(token, JWKS);
      req.claims = payload as TClaims;
      next();
    } catch {
      res.status(401).json(unauthorized);
    }
  };
}
