import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'bspa';
import type { Request, Response } from 'express';

interface JwtClaims {
  sub: string;
  name: string;
  admin: boolean;
  iat: number;
}

const DEMO_JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiYWRtaW4iOnRydWUsImlhdCI6MTUxNjIzOTAyMn0.KMUFsIDTnFmyG3nMiGM6H9FNFUROf3wh7SmqJp-QV30';

function generateMockJwt(): string {
  return DEMO_JWT;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const server = createServer<JwtClaims>({
  app: {
    name: 'angular-spa',
    spa: {
      root: path.join(__dirname, './browser'),
      basePath: '/',
      fallback: 'index.html',
    },
  },
  proxy: {
    basePath: '/api',
    routes: [
      { path: '/users', access: 'private', target: 'http://localhost:3001' },
      { path: '/products', access: 'private', target: 'http://localhost:3001' },
    ],
  },
  api: {
    basePath: '/bff',
    routes: [
      {
        path: '/token',
        access: 'public',
        handler: (_req: Request, res: Response): void => {
          res.json({ token: generateMockJwt() });
        },
      },
      {
        path: '/config',
        access: 'public',
        handler: (_req: Request, res: Response): void => {
          res.json({
            apiUrl: 'http://localhost:3001',
            environment: process.env['NODE_ENV'] || 'development',
          });
        },
      },
      {
        path: '/admin',
        access: 'private',
        handler: (req: Request, res: Response): void => {
          res.json({ user: req.claims, data: 'secret' });
        },
      },
    ],
  },
  security: {
    cors: 'internal',
    csp: 'strict',
  },
  auth: {
    strategy: 'bearer',
    secret: 'a-string-secret-at-least-256-bits-long',
  },
});

await server.start();
