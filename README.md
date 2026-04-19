<p align="center">
  <img src="https://github.com/kevinchatham/halide/blob/main/images/halide-logo.png?raw=true" alt="halide" width="150px" height="150px"/>
  <br/>
  <em>A backend-for-frontend runtime for single page applications.</em>
  <br/><br/>
  <a href="./LICENSE">
    <img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT License"/>
  </a>
  <img src="https://img.shields.io/badge/node-%3E%3D18-green" alt="Node.js"/>
  <img src="https://img.shields.io/npm/v/halide" alt="npm"/>
</p>

## What is Halide?

Halide is a Node.js runtime that sits between your SPA and your backend services, giving you a single place to define how your frontend talks to your backend.

```
Browser (SPA)
    ↓
Halide (BFF runtime)
    ↓
Private backend services
```

Every SPA project ends up reinventing the same backend-for-frontend patterns: serving static files, validating tokens, proxying to internal services, handling CORS, and composing API responses. Halide gives these concerns a shared structure so you don't have to rebuild them each time.

It is not an API gateway, a service mesh, or a full backend framework. It is specifically designed around SPA application boundaries.

## Quick start

```bash
npm install halide
```

```ts
import { createServer } from 'halide';

const server = await createServer({
  spa: {
    root: './dist/browser',
  },
  apiRoutes: [
    {
      type: 'api',
      path: '/health',
      access: 'public',
      handler: async () => ({ status: 'ok' }),
    },
  ],
});

await server.start();
```

The server starts on port 3001 (overridable via the `PORT` environment variable).

## Why Halide?

In most SPA setups, each application carries its own BFF implementation. Over time this leads to:

- Inconsistent auth handling across projects
- Duplicated proxy logic
- Backend service URLs leaking into frontend code
- CORS configuration repeated across services
- Unclear boundaries between frontend and backend responsibilities

Halide provides a shared structure for all of these concerns.

## Configuration

The server is configured through a single `ServerConfig` object passed to `createServer`.

### SPA hosting

```ts
spa: {
  name: 'my-app',          // used in log output
  root: './dist/browser',  // directory of built static assets
  fallback: 'index.html',  // served for unmatched routes (client-side routing)
  apiPrefix: '/api',       // paths with this prefix get 404 instead of SPA fallback
}
```

`spa.root` is the only required field. `apiPrefix` defaults to `'/api'` — set it to `''` to disable the 404 behavior.

### API routes

API routes are handler functions that compose and return data directly. They define the controlled API surface your frontend can call.

```ts
apiRoutes: [
  {
    type: 'api',
    path: '/bff/config',
    access: 'public',
    method: 'get',
    handler: async (ctx, claims, logger) => ({
      environment: process.env.NODE_ENV,
    }),
  },
  {
    type: 'api',
    path: '/users',
    access: 'private',
    method: 'post',
    validationSchema: CreateUserSchema, // Zod schema — body is validated before handler runs
    handler: async (ctx, claims, logger) => {
      return { id: crypto.randomUUID(), ...ctx.body };
    },
  },
];
```

The handler receives three arguments:

| Parameter | Type                               | Description                                              |
| --------- | ---------------------------------- | -------------------------------------------------------- |
| `ctx`     | `RequestContext & { body: TBody }` | Method, path, headers, params, query, and validated body |
| `claims`  | `TClaims \| undefined`             | Decoded JWT claims (undefined for public routes)         |
| `logger`  | `Logger`                           | Structured logger instance                               |

You can also use the `apiRoute()` factory, which fills in the `type` field and a default `authorize` function:

```ts
import { apiRoute } from 'halide';

const healthRoute = apiRoute({
  access: 'public',
  path: '/health',
  handler: async () => ({ status: 'ok' }),
});
```

### Proxy routes

Proxy routes forward requests to a backend service. Use them when you don't need to compose data — just pass through.

```ts
proxyRoutes: [
  {
    type: 'proxy',
    path: '/api/products',
    access: 'private',
    methods: ['get', 'post'],
    target: 'http://products.internal',
    proxyPath: '/products', // rewrites /api/products → /products on the target
    timeout: 5000, // ms before aborting
    identity: (ctx, claims) => ({
      'x-user-id': claims.sub, // headers injected into the proxied request
    }),
    transform: ({ body, headers }) => ({
      body: { ...body, source: 'halide' },
      headers,
    }),
  },
];
```

Use the `proxyRoute()` factory for the same convenience as `apiRoute()`:

```ts
import { proxyRoute } from 'halide';

const productsProxy = proxyRoute({
  access: 'private',
  path: '/api/products',
  methods: ['get'],
  target: 'http://products.internal',
  proxyPath: '/products',
});
```

### Authentication

Auth is configured under `security.auth`. Halide supports two strategies:

**Bearer (shared secret)**

```ts
security: {
  auth: {
    strategy: 'bearer',
    secret: () => process.env.JWT_SECRET,
    audience: 'my-app',           // optional — validates the aud claim
  },
}
```

**JWKS (remote key set)**

```ts
security: {
  auth: {
    strategy: 'jwks',
    jwksUri: 'https://idp.example.com/.well-known/jwks.json',
    audience: 'my-app',
  },
}
```

Routes with `access: 'private'` require a valid JWT. If any private route exists, `security.auth` must be configured — the server will refuse to start otherwise.

### Authorization

Every route accepts an optional `authorize` function for fine-grained access control:

```ts
{
  type: 'api',
  path: '/admin/settings',
  access: 'private',
  authorize: (ctx, claims, logger) => claims.role === 'admin',
  handler: async (ctx, claims, logger) => ({ settings: '...' }),
}
```

The `authorize` function receives `(ctx, claims, logger)` and returns `boolean | Promise<boolean>`. Unauthorized requests receive a `403 Forbidden` response.

### Security

```ts
security: {
  cors: {
    origin: ['https://myapp.com'],
    credentials: true,
    methods: ['get', 'post', 'put', 'delete', 'patch'],
    allowedHeaders: ['content-type', 'authorization'],
    maxAge: 3600,
  },
  csp: {
    directives: {
      'default-src': ["'self'"],
      'script-src': ["'self'"],
      'connect-src': ["'self'", 'https://api.example.com'],
    },
  },
  rateLimit: {
    maxRequests: 100,
    windowMs: 900000,  // 15 minutes
  },
}
```

- **CORS**: Wildcard origin (`*`) cannot be combined with `credentials: true` — the validator will catch this.
- **CSP**: Defaults to Helmet's `contentSecurityPolicy.getDefaultDirectives()` if not specified.
- **Rate limiting**: IP-based sliding window. Defaults to 100 requests per 15 minutes.

### Observability

```ts
observability: {
  requestId: true,       // generates/forwards x-request-id headers
  logger: myLogger,      // your Logger implementation (defaults to no-op if omitted)
  onRequest: (ctx, claims, logger) => {
    logger.info(`${ctx.method} ${ctx.path}`);
  },
  onResponse: (ctx, claims, response, logger) => {
    logger.info(`${ctx.method} ${ctx.path} ${response.statusCode} ${response.durationMs}ms`);
  },
}
```

Per-route observability is controlled with the `observe` flag. Set `observe: false` on a route to skip hooks for that route.

### OpenAPI / Swagger UI

```ts
openapi: {
  enabled: true,
  path: '/swagger',            // where Swagger UI is served (default: /swagger)
  options: {
    title: 'My App API',
    description: 'Auto-generated API documentation',
    version: '1.0.0',
    includeProxyRoutes: true,  // include proxy routes in the spec (default: true)
  },
}
```

Attach metadata to individual routes for richer documentation:

```ts
{
  type: 'api',
  path: '/users',
  access: 'public',
  method: 'post',
  validationSchema: CreateUserSchema,
  openapi: {
    summary: 'Create a user',
    description: 'Creates a new user with the given name and email.',
    tags: ['Users'],
    responseSchema: UserResponseSchema,
    requestSchemaName: 'CreateUserRequest',
    schemaName: 'UserResponse',
  },
  handler: async (ctx) => createUser(ctx.body),
}
```

Zod schemas (both `validationSchema` and `openapi.responseSchema`) are automatically converted to JSON Schema in the generated spec.

## Full example

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

const server = await createServer<UserClaims>({
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
        'default-src': ["'self'"],
        'script-src': ["'self'"],
        'connect-src': ["'self'"],
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

await server.start();
```

## API reference

### `createServer<TClaims>(config): Promise<Server>`

Creates and returns a Halide server. Validates the config before starting.

### `Server`

| Method    | Description                                                   |
| --------- | ------------------------------------------------------------- |
| `start()` | Starts listening on `PORT` (default 3001)                     |
| `stop()`  | Gracefully shuts down the HTTP server and cleans up resources |

### `apiRoute<TClaims, TBody>(input): ApiRoute`

Factory that fills in `type: 'api'` and a default `authorize` function.

### `proxyRoute<TClaims>(input): ProxyRoute`

Factory that fills in `type: 'proxy'` and a default `authorize` function.

### Exported types

| Type                              | Description                                                             |
| --------------------------------- | ----------------------------------------------------------------------- |
| `ServerConfig<TClaims>`           | Top-level configuration object                                          |
| `ApiRoute<TClaims, TBody>`        | API route definition                                                    |
| `ProxyRoute<TClaims>`             | Proxy route definition                                                  |
| `Route<TClaims, TBody>`           | Union of `ApiRoute \| ProxyRoute`                                       |
| `ApiRouteHandler<TClaims, TBody>` | `(ctx, claims, logger) => Promise<unknown>`                             |
| `AuthorizeFn<TClaims>`            | `(ctx, claims, logger) => boolean \| Promise<boolean>`                  |
| `TransformFn`                     | `({ body, headers }) => { body, headers }`                              |
| `RequestContext`                  | Normalized request context (method, path, headers, params, query, body) |
| `ResponseContext`                 | Response metadata (statusCode, durationMs, error?)                      |
| `SecurityConfig`                  | CORS, CSP, auth, rate limit configuration                               |
| `SecurityAuthConfig`              | Auth strategy, secret/JWKS, audience                                    |
| `CorsConfig`                      | Origin, methods, credentials, headers                                   |
| `SpaConfig`                       | Static file serving configuration                                       |
| `ObservabilityConfig<TClaims>`    | Logger, request ID, lifecycle hooks                                     |
| `OpenApiConfig`                   | Swagger UI toggle, path, and options                                    |
| `Logger`                          | `{ debug, error, info, warn }` interface                                |

## What this is (and isn't)

**Halide is:**

- A runtime layer for SPA backends
- A way to standardize BFF structure across applications
- A controlled entry point to backend systems

**Halide is not:**

- An API gateway replacement
- A service mesh
- A full backend framework
- A distributed systems abstraction layer

## License

[MIT](./LICENSE)
