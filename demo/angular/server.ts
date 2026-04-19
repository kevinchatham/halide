import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Request, Response } from 'express';
import type { Server } from 'halide';
import { createServer } from 'halide';

interface JwtClaims {
  admin: boolean;
  iat: number;
  name: string;
  sub: string;
}

const DEMO_JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiYWRtaW4iOnRydWUsImlhdCI6MTUxNjIzOTAyMn0.KMUFsIDTnFmyG3nMiGM6H9FNFUROf3wh7SmqJp-QV30';

function generateMockJwt(): string {
  return DEMO_JWT;
}

const __dirname: string = path.dirname(fileURLToPath(import.meta.url));

const server: Server = createServer<JwtClaims>({
  api: {
    basePath: '/bff',
    routes: [
      {
        access: 'public',
        handler: (_req: Request, res: Response): void => {
          res.json({ token: generateMockJwt() });
        },
        method: 'get',
        path: '/token',
      },
      {
        access: 'public',
        handler: (_req: Request, res: Response): void => {
          res.json({
            apiUrl: 'http://localhost:3000',
            environment: process.env['NODE_ENV'] || 'development',
          });
        },
        method: 'get',
        path: '/config',
      },
      {
        access: 'private',
        handler: (req: Request, res: Response): void => {
          res.json({ data: 'secret', user: req.claims });
        },
        method: 'get',
        path: '/admin',
      },
    ],
  },
  auth: {
    secret: 'a-string-secret-at-least-256-bits-long',
    strategy: 'bearer',
  },
  proxy: {
    basePath: '/api',
    routes: [
      { access: 'private', path: '/users', target: 'http://localhost:3000' },
      { access: 'private', path: '/products', target: 'http://localhost:3000' },
    ],
  },
  security: {
    cors: {
      credentials: true,
      origin: ['http://localhost:4200', 'http://localhost:3001'],
    },
    csp: {
      connectSrc: ["'self'"],
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
    },
  },
  spa: {
    fallback: 'index.html',
    name: 'angular',
    root: path.join(__dirname, './browser'),
  },
});

await server.start();
