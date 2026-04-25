# Full example

```ts
import { createServer, apiRoute, proxyRoute } from 'halide';
import { z } from 'zod';

interface UserClaims {
  sub: string;
  role: 'admin' | 'user';
}

const CreateUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
});

const server = createServer<UserClaims>({
  spa: {
    name: 'dashboard',
    root: './dist/browser',
  },

  security: {
    cors: {
      origin: ['https://dashboard.example.com'],
      credentials: true,
    },
    csp: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        connectSrc: ["'self'"],
      },
    },
    auth: {
      strategy: 'jwks',
      jwksUri: 'https://idp.example.com/.well-known/jwks.json',
      audience: 'dashboard',
    },
    rateLimit: {
      maxRequests: 100,
      windowMs: 900000,
    },
  },

  observability: {
    requestId: true,
    onRequest: (ctx, claims, logger) => {
      logger.info(`[Request] ${ctx.method} ${ctx.path} user=${claims?.sub ?? 'anon'}`);
    },
    onResponse: (ctx, claims, { statusCode, durationMs }, logger) => {
      logger.info(`[Response] ${ctx.method} ${ctx.path} ${statusCode} ${durationMs}ms`);
    },
  },

  apiRoutes: [
    apiRoute({
      access: 'public',
      path: '/health',
      handler: async () => ({ status: 'ok' }),
    }),
    apiRoute({
      access: 'public',
      path: '/config',
      handler: async () => ({ environment: process.env.NODE_ENV }),
    }),
    apiRoute({
      access: 'private',
      path: '/users',
      method: 'post',
      validationSchema: CreateUserSchema,
      openapi: {
        summary: 'Create a user',
        tags: ['Users'],
        responseSchema: z.object({ id: z.string(), email: z.string(), name: z.string() }),
      },
      handler: async (ctx, claims, logger) => ({
        id: crypto.randomUUID(),
        email: ctx.body.email,
        name: ctx.body.name,
      }),
    }),
    apiRoute({
      access: 'private',
      path: '/admin/settings',
      authorize: (_ctx, claims) => claims.role === 'admin',
      handler: async () => ({ maintenance: false }),
    }),
  ],

  proxyRoutes: [
    proxyRoute({
      access: 'private',
      path: '/api/orders',
      methods: ['get'],
      target: 'http://orders.internal:8080',
      proxyPath: '/orders',
      identity: (_ctx, claims) => ({ 'x-user-id': claims.sub }),
    }),
  ],

  openapi: {
    enabled: true,
    options: {
      title: 'Dashboard API',
      description: 'API documentation for the dashboard BFF',
    },
  },
});

server.start((port) => {
  console.log(`Server running on port ${port}`);
});
```
