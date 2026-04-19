import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import type { RequestContext, Server } from 'halide';
import { apiRoute, createServer, proxyRoute } from 'halide';

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

const server: Server = await createServer<JwtClaims>({
  apiRoutes: [
    apiRoute({
      access: 'public',
      handler: async () => ({ token: generateMockJwt() }),
      method: 'get',
      path: '/token',
    }),
    apiRoute({
      access: 'public',
      handler: async () => ({
        apiUrl: 'http://localhost:3000',
        environment: process.env['NODE_ENV'] || 'development',
      }),
      method: 'get',
      path: '/config',
    }),
    apiRoute({
      access: 'private',
      handler: async (_ctx: RequestContext, claims: JwtClaims | undefined) => ({
        data: 'secret',
        user: claims,
      }),
      method: 'get',
      path: '/admin',
    }),
  ],
  proxyRoutes: [
    proxyRoute({
      access: 'private',
      methods: ['get', 'post', 'put', 'patch', 'delete'],
      path: '/users',
      target: 'http://localhost:3000',
    }),
    proxyRoute({
      access: 'private',
      methods: ['get', 'post', 'put', 'patch', 'delete'],
      path: '/products',
      target: 'http://localhost:3000',
    }),
  ],
  security: {
    auth: {
      secret: () => 'a-string-secret-at-least-256-bits-long',
      strategy: 'bearer',
    },
    cors: {
      credentials: true,
      origin: ['http://localhost:4200', 'http://localhost:3553'],
    },
    csp: {
      directives: {
        connectSrc: ["'self'"],
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
      },
    },
  },
  spa: {
    fallback: 'index.html',
    name: 'angular',
    root: path.join(__dirname, './browser'),
  },
});

await server.start();
