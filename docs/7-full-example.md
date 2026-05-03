# Full example

```ts
import { createServer, apiRoute, proxyRoute } from 'halide';
import { z } from 'zod';

interface UserClaims {
  sub: string;
  role: 'admin' | 'user';
}

type App = THalideApp<UserClaims>;

const CreateUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
});

const server = createServer<App>({
  app: {
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
    onRequest: (ctx, app) => {
      app.logger.info(`[Request] ${ctx.method} ${ctx.path} user=${app.claims?.sub ?? 'anon'}`);
    },
    onResponse: (ctx, app, { statusCode, durationMs }) => {
      app.logger.info(`[Response] ${ctx.method} ${ctx.path} ${statusCode} ${durationMs}ms`);
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
      requestSchema: CreateUserSchema,
      responseSchema: z.object({ id: z.string(), email: z.string(), name: z.string() }),
      openapi: {
        summary: 'Create a user',
        tags: ['Users'],
      },
      handler: async (ctx, app) => ({
        id: crypto.randomUUID(),
        email: ctx.body.email,
        name: ctx.body.name,
      }),
    }),
    apiRoute({
      access: 'private',
      path: '/admin/settings',
      authorize: (_ctx, app) => app.claims?.role === 'admin',
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
      identity: (_ctx, app) => ({ 'x-user-id': app.claims?.sub }),
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
