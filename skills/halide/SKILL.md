---
name: halide
description: Build Hono-based BFF (Backend for Frontend) servers with Halide — routing, auth, proxying, SPA serving, middleware, OpenAPI, and observability
---

## Overview

Halide is a declarative BFF (Backend for Frontend) runtime built on Hono. It standardizes how SPAs communicate with backend services by providing a shared, predictable structure for auth, routing, proxying, and security.

**What you get out of the box:**

- Static SPA hosting with fallback routing
- Typed API routes with Zod validation
- Secure proxying to backend services with path rewriting
- Built-in JWT auth (bearer/JWKS)
- CORS, CSP, and rate limiting
- Optional OpenAPI documentation with Scalar UI
- Request lifecycle hooks (onRequest/onResponse)

**When to use:** You have a SPA (Angular, React, Vue, Svelte) and need a BFF layer between it and your backend services.

**When not to use:** You need direct HTTP layer control, multi-service routing, circuit breakers, load balancing, or TLS termination — use an API gateway or service mesh instead.

## Installation

```bash
npm install halide
```

Requires **Node.js >= 24.0.0**. This is an ESM project (`"type": "module"`).

## Quick Start

```typescript
import { createServer, apiRoute, proxyRoute } from 'halide';

const server = createServer({
  spa: {
    name: 'my-app',
    root: 'dist',
  },
  apiRoutes: [
    apiRoute({
      access: 'public',
      method: 'get',
      path: '/api/health',
      handler: async () => ({ status: 'ok' }),
    }),
  ],
  proxyRoutes: [
    proxyRoute({
      access: 'private',
      methods: ['get'],
      path: '/api/users',
      target: 'http://user-svc:3000',
    }),
  ],
});

server.start((port) => {
  console.log(`Server running on port ${port}`);
});
```

Run with: `npx tsx server.ts`

Port resolution: `PORT` env variable → `spa.port` config → default **3553**.

## Exports

All imports come from `'halide'`:

### Functions

| Export                            | Description                                                                                                  |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `createServer<TClaims>(config)`   | Creates a server instance. Returns `{ ready, start, stop }`. Synchronous.                                    |
| `createApp<TClaims>(config)`      | Creates a Hono app without starting an HTTP server. Returns `{ app, rateLimitDispose }`. Useful for testing. |
| `apiRoute<TClaims, TBody>(input)` | Factory that fills in `type: 'api'` and default `authorize`.                                                 |
| `proxyRoute<TClaims>(input)`      | Factory that fills in `type: 'proxy'` and default `authorize`.                                               |

### Types

| Type                              | Description                                                                   |
| --------------------------------- | ----------------------------------------------------------------------------- |
| `ServerConfig<TClaims>`           | Top-level configuration object                                                |
| `Server`                          | Server instance with `ready`, `start(onReady)`, `stop()`                      |
| `CreateAppResult`                 | Return of `createApp()` — `{ app, rateLimitDispose }`                         |
| `ApiRoute<TClaims, TBody>`        | API route definition                                                          |
| `ApiRouteHandler<TClaims, TBody>` | Handler signature: `(ctx, claims, logger) => Promise<unknown>`                |
| `ProxyRoute<TClaims>`             | Proxy route definition                                                        |
| `AuthorizeFn<TClaims>`            | `(ctx, claims, logger) => boolean \| Promise<boolean>`                        |
| `TransformFn`                     | `({ body, headers }) => { body, headers }`                                    |
| `RequestContext`                  | Normalized request context: `{ method, path, headers, params, query, body? }` |
| `SecurityConfig`                  | CORS, CSP, auth, rate limit configuration                                     |
| `SecurityAuthConfig`              | Auth strategy, secret/JWKS, audience                                          |
| `CorsConfig`                      | Origin, methods, credentials, headers                                         |
| `CspOptions`                      | CSP directives container                                                      |
| `CspDirectives`                   | CSP directive map (camelCase keys)                                            |
| `SpaConfig`                       | Static file serving configuration                                             |
| `ObservabilityConfig<TClaims>`    | Logger, requestId, lifecycle hooks                                            |
| `OpenApiConfig`                   | OpenAPI toggle, path, options                                                 |
| `OpenApiRouteMeta`                | Per-route OpenAPI metadata                                                    |
| `Logger`                          | `{ debug, error, info, warn }` interface                                      |
| `ClaimExtractor<TClaims>`         | Function to extract claims from a Hono Context                                |

## ServerConfig

The top-level configuration object passed to `createServer()`:

```typescript
interface ServerConfig<TClaims = unknown> {
  spa: SpaConfig; // REQUIRED
  apiRoutes?: ApiRoute<TClaims>[]; // optional array
  proxyRoutes?: ProxyRoute<TClaims>[]; // optional array
  security?: SecurityConfig; // optional
  observability?: ObservabilityConfig<TClaims>; // optional
  openapi?: OpenApiConfig; // optional
}
```

**Critical:** `ServerConfig` uses **separate arrays** — `apiRoutes` and `proxyRoutes`. There is no single `routes` array.

### SpaConfig (REQUIRED)

```typescript
interface SpaConfig {
  root: string; // REQUIRED — path to SPA build output directory
  name?: string; // default: 'app' — used in log messages
  port?: number; // default: 3553 — server listen port
  fallback?: string; // default: 'index.html' — SPA fallback file
  apiPrefix?: string; // default: '/api' — paths starting with this get 404 instead of SPA fallback. Set to '' to disable.
}
```

### SecurityConfig

```typescript
interface SecurityConfig {
  auth?: SecurityAuthConfig;
  cors?: CorsConfig;
  csp?: CspOptions;
  rateLimit?: { maxRequests?: number; windowMs?: number };
}
```

## Auth

Configure under `security.auth`. **Private routes require `security.auth` to be configured** — the validator will throw if any route has `access: 'private'` without auth config.

### Bearer (shared secret, HS256)

Uses `hono/jwt` internally.

```typescript
security: {
  auth: {
    strategy: 'bearer',
    secret: () => process.env.JWT_SECRET,    // string or async function
    audience: 'my-app',                       // optional — validates the 'aud' claim
  },
}
```

### JWKS (remote key set, RS256)

Uses `hono/jwk` internally.

```typescript
security: {
  auth: {
    strategy: 'jwks',
    jwksUri: 'https://idp.example.com/.well-known/jwks.json',
    audience: 'my-app',    // optional
  },
}
```

The `secret` field can be a synchronous or async function — it is resolved on each request.

### How auth works

- JWTs are extracted from the `Authorization: Bearer <token>` header
- For bearer: token is verified with `hono/jwt` `verify()` using HS256
- For JWKS: token is verified with `hono/jwk` middleware using RS256
- If audience is specified, the `aud` claim is validated (supports string or array)
- Failed auth returns `401 Unauthorized` with `{ error: 'Unauthorized' }`
- Public routes skip auth entirely — `claims` will be `undefined` in handlers

## Authorization

Beyond the `access: 'public' | 'private'` toggle, every route accepts an optional `authorize` function for fine-grained access control:

```typescript
apiRoute({
  access: 'private',
  path: '/admin/settings',
  authorize: (ctx, claims, logger) => claims?.role === 'admin',
  handler: async () => ({ settings: '...' }),
});
```

The `authorize` function receives `(ctx, claims, logger)` and returns `boolean | Promise<boolean>`. Failed authorization returns `403 Forbidden` with `{ error: 'Forbidden' }`.

The `apiRoute()` and `proxyRoute()` factories fill in a default `authorize` that always returns `true`.

## API Routes

Created with `apiRoute()`. These are handler functions that compose and return data directly.

```typescript
apiRoute({
  access: 'public' | 'private',    // REQUIRED
  path: '/api/health',             // REQUIRED — must start with /
  method: 'get',                   // default: 'get'
  handler: async (ctx, claims, logger) => ({ status: 'ok' }),  // REQUIRED
  validationSchema: MyZodSchema,   // optional — Zod schema for body validation
  authorize: (ctx, claims, logger) => true,  // auto-filled by factory
  observe: true,                   // optional — set false to skip observability hooks
  openapi: { ... },                // optional — OpenAPI metadata
})
```

### Handler Signature

```typescript
handler: (ctx: RequestContext & { body: TBody }, claims: TClaims | undefined, logger: Logger) =>
  Promise<unknown>;
```

- `ctx` is a **plain object** (NOT a Hono Context) with `{ method, path, headers, params, query, body }`
- `claims` is populated only for private routes with successful auth
- `logger` is the configured Logger (defaults to no-op if omitted)
- Return value is automatically JSON-serialized via `c.json(result)`

### Body Validation

Attach a Zod schema with `validationSchema`. The body is parsed and validated before the handler runs. Failed validation returns `400 Bad Request`.

```typescript
import { z } from 'zod';

const CreateUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
});

apiRoute({
  access: 'private',
  path: '/users',
  method: 'post',
  validationSchema: CreateUserSchema,
  handler: async (ctx) => createUser(ctx.body),
});
```

For routes without `validationSchema`, the body is parsed from JSON for POST/PUT/PATCH requests (returns `undefined` if parsing fails).

### Supported Methods

`'get'`, `'post'`, `'put'`, `'patch'`, `'delete'` — defaults to `'get'`.

## Proxy Routes

Created with `proxyRoute()`. These forward requests to backend services.

```typescript
proxyRoute({
  access: 'public' | 'private',    // REQUIRED
  path: '/api/products',           // REQUIRED — must start with /
  methods: ['get', 'post'],        // REQUIRED — array of HTTP methods
  target: 'http://products.internal',  // REQUIRED
  proxyPath: '/products',          // optional — rewrites path prefix (defaults to path)
  timeout: 5000,                   // optional — ms, default: 60000
  identity: (ctx, claims) => ({ 'x-user-id': claims.sub }),  // optional
  transform: ({ body, headers }) => ({ body, headers }),     // optional
  authorize: (ctx, claims, logger) => true,  // auto-filled by factory
  observe: true,                   // optional
  openapi: { ... },                // optional
})
```

### Path Rewriting

The `path` is the incoming route prefix. The `proxyPath` (defaults to `path` if omitted) is the prefix on the target. The incoming path prefix is replaced with `proxyPath`:

```
Incoming: /api/products/123
path:     /api/products
proxyPath: /products
Result:   http://products.internal/products/123
```

Query parameters and the remainder of the path are forwarded as-is.

### Identity Headers

The `identity` function receives `(ctx, claims)` and returns a `Record<string, string>` of headers to inject into the proxied request. Only called when `claims` is defined (i.e., private routes with successful auth).

```typescript
identity: (ctx, claims) => ({
  'x-user-id': claims.sub,
  'x-user-role': claims.role,
});
```

### Transform

The `transform` function receives `{ body, headers }` and returns `{ body, headers }` to modify the request before proxying. The body is JSON-stringified. Headers are normalized to lowercase keys.

```typescript
transform: ({ body, headers }) => ({
  body: { ...body, source: 'halide' },
  headers: { ...headers, 'x-proxy': 'true' },
});
```

If no transform is provided, the raw request body is forwarded as-is.

### Timeout

Defaults to **60,000ms** (60 seconds). Uses `AbortSignal.timeout()`.

## Security

### CORS

Applied to all routes via `hono/cors`.

```typescript
security: {
  cors: {
    origin: ['http://localhost:4200'],
    credentials: true,
    methods: ['get', 'post', 'put', 'delete', 'patch'],
    allowedHeaders: ['content-type', 'authorization'],
    exposedHeaders: ['x-custom-header'],
    maxAge: 3600,
  },
}
```

**Defaults:** `origin: ['*']`, `credentials: false`, `methods: ['get', 'post', 'put', 'delete', 'patch']`.

**Gotcha:** Wildcard origin (`'*'`) cannot be combined with `credentials: true` — the validator will throw.

### CSP

Applied via `hono/secure-headers`. Always active — defaults to a restrictive policy if not specified.

```typescript
security: {
  csp: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'", 'https://api.example.com'],
      styleSrc: ["'self'", 'https:', "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      fontSrc: ["'self'", 'https:', 'data:'],
      frameAncestors: ["'self'"],
      formAction: ["'self'"],
      objectSrc: ["'none'"],
      scriptSrcAttr: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
}
```

**Gotcha:** CSP directive keys must use **camelCase** (`defaultSrc`), NOT kebab-case (`default-src`). The validator throws on kebab-case keys.

### Available CSP Directives

All directive keys use camelCase:

| Directive                 | Type                  |
| ------------------------- | --------------------- |
| `baseUri`                 | `CspDirectiveValue[]` |
| `childSrc`                | `CspDirectiveValue[]` |
| `connectSrc`              | `CspDirectiveValue[]` |
| `defaultSrc`              | `CspDirectiveValue[]` |
| `fontSrc`                 | `CspDirectiveValue[]` |
| `formAction`              | `CspDirectiveValue[]` |
| `frameAncestors`          | `CspDirectiveValue[]` |
| `frameSrc`                | `CspDirectiveValue[]` |
| `imgSrc`                  | `CspDirectiveValue[]` |
| `manifestSrc`             | `CspDirectiveValue[]` |
| `mediaSrc`                | `CspDirectiveValue[]` |
| `objectSrc`               | `CspDirectiveValue[]` |
| `sandbox`                 | `CspDirectiveValue[]` |
| `scriptSrc`               | `CspDirectiveValue[]` |
| `scriptSrcAttr`           | `CspDirectiveValue[]` |
| `scriptSrcElem`           | `CspDirectiveValue[]` |
| `styleSrc`                | `CspDirectiveValue[]` |
| `styleSrcAttr`            | `CspDirectiveValue[]` |
| `styleSrcElem`            | `CspDirectiveValue[]` |
| `upgradeInsecureRequests` | `CspDirectiveValue[]` |
| `workerSrc`               | `CspDirectiveValue[]` |

`CspDirectiveValue` is `string | ContentSecurityPolicyOptionHandler`.

### Default CSP Directives

If no CSP is specified, these defaults apply:

```
baseUri: ["'self'"]
defaultSrc: ["'self'"]
fontSrc: ["'self'", 'https:', 'data:']
formAction: ["'self'"]
frameAncestors: ["'self'"]
frameSrc: ["'self'"]
imgSrc: ["'self'", 'data:']
objectSrc: ["'none'"]
scriptSrc: ["'self'"]
scriptSrcAttr: ["'none'"]
styleSrc: ["'self'", 'https:', "'unsafe-inline'"]
upgradeInsecureRequests: []
```

### Rate Limiting

IP-based sliding window. Opt-in — not enabled unless `security.rateLimit` is configured.

```typescript
security: {
  rateLimit: {
    maxRequests: 100,    // default: 100
    windowMs: 900000,    // default: 900000 (15 minutes)
  },
}
```

Client IP is determined from `x-forwarded-for` header (first value) or falls back to `'unknown'`. Returns `429 Too Many Requests` with `Retry-After` header when exceeded.

## SPA

Serves static files from the `root` directory. Non-file requests fall back to the SPA's `fallback` file (default: `index.html`).

```typescript
spa: {
  root: 'dist',             // REQUIRED
  name: 'my-app',           // default: 'app' — used in log messages
  port: 3553,               // default: 3553
  fallback: 'index.html',   // default: 'index.html'
  apiPrefix: '/api',        // default: '/api' — paths starting with this get 404 instead of SPA fallback
}
```

The `apiPrefix` prevents API requests from accidentally returning the SPA HTML. Set to `''` (empty string) to disable this behavior.

## Observability

```typescript
observability: {
  requestId: true,       // generates/forwards x-request-id headers
  logger: myLogger,      // defaults to no-op Logger if omitted
  onRequest: (ctx, claims, logger) => { ... },
  onResponse: (ctx, claims, response, logger) => { ... },
}
```

### Logger Interface

```typescript
interface Logger {
  debug: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
}
```

If no logger is provided, a no-op logger is used (all methods are empty functions).

### Lifecycle Hooks

- `onRequest(ctx, claims, logger)` — called after auth/authorization, before handler
- `onResponse(ctx, claims, response, logger)` — called after handler completes

The `response` object contains:

```typescript
interface ResponseContext {
  statusCode: number;
  durationMs: number;
  error?: Error;
}
```

### Per-Route Observability

Set `observe: false` on a route to skip `onRequest`/`onResponse` hooks for that specific route.

### Request ID Middleware

When `observability.requestId` is `true`, every request gets an `x-request-id` header (from the incoming request or generated via `crypto.randomUUID()`).

## OpenAPI

Enable OpenAPI documentation with Scalar UI:

```typescript
openapi: {
  enabled: true,
  path: '/swagger',    // default: '/swagger'
  options: {
    title: 'My App API',
    description: 'API documentation',
    version: '1.0.0',
    servers: [{ url: 'https://api.example.com', description: 'Production' }],
  },
}
```

### Per-Route Metadata

Attach to individual routes via `openapi`:

```typescript
openapi: {
  summary: 'Create a user',
  description: 'Creates a new user',
  tags: ['Users'],
  responseSchema: UserResponseSchema,           // Zod schema for 200 response
  requestSchemaName: 'CreateUserRequest',       // name for request schema
  schemaName: 'UserResponse',                   // name for response schema
  responses: {                                  // alternative: map of status codes
    200: { description: 'Success', schema: UserSchema },
    400: { description: 'Bad Request' },
    401: { description: 'Unauthorized' },
  },
}
```

Set `observe: false` on a route to hide it from OpenAPI docs.

Zod schemas from `validationSchema` and `openapi.responseSchema` are automatically converted to JSON Schema in the generated spec.

## Server Lifecycle

```typescript
const server = createServer(config);

// Start listening
server.start((port) => {
  console.log(`Listening on ${port}`);
});

// Wait for server to be ready
await server.ready;

// Graceful shutdown
await server.stop();
```

- `createServer()` is **synchronous** — no `await` needed
- `start(onReady?)` starts the HTTP server. `onReady` is called when listening
- `ready` is a `Promise<void>` that resolves when the server is listening
- `stop()` gracefully closes the HTTP server and cleans up resources
- SIGINT/SIGTERM are handled automatically — calls `stop()` then `process.exit(0)`

## createApp (Testing)

For testing or custom server setups, use `createApp()` to get a Hono app without starting an HTTP server:

```typescript
import { createApp } from 'halide';

const { app, rateLimitDispose } = createApp(config);
// Use app.fetch() for testing, or pass to your own server
rateLimitDispose?.(); // clean up rate limit timer when done
```

## Error Handling

All unhandled errors are caught and return `500 Internal Server Error` with `{ error: 'Internal Server Error' }`. Errors are logged via the configured logger.

## Complete Example

```typescript
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
    port: 3553,
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
      access: 'private',
      path: '/users',
      method: 'post',
      validationSchema: CreateUserSchema,
      openapi: {
        summary: 'Create a user',
        tags: ['Users'],
        responseSchema: z.object({ id: z.string(), email: z.string(), name: z.string() }),
      },
      handler: async (ctx) => ({
        id: crypto.randomUUID(),
        email: ctx.body.email,
        name: ctx.body.name,
      }),
    }),
    apiRoute({
      access: 'private',
      path: '/admin/settings',
      authorize: (_ctx, claims) => claims?.role === 'admin',
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

## Gotchas

- **Framework**: Hono (not Express). All HTTP types come from `hono`
- **Config shape**: `ServerConfig` uses separate arrays: `apiRoutes` + `proxyRoutes`, NOT a single `routes` array
- **Auth config is nested**: `security.auth.strategy` — not a top-level `auth` key
- **Handler signature**: `(ctx, claims, logger)` — 3 parameters. `ctx` is a plain object, NOT a Hono Context
- **CSP directives**: Must use camelCase (`defaultSrc`), NOT kebab-case (`default-src`) — validator throws on kebab-case
- **Private routes require auth**: If any route has `access: 'private'`, `security.auth` must be configured
- **CORS wildcard**: `origin: '*'` cannot be combined with `credentials: true` — validator throws
- **apiPrefix**: Defaults to `'/api'` — paths starting with this prefix get 404 instead of SPA fallback. Set `apiPrefix: ''` to disable
- **Default port**: 3553 (from `PORT` env → `spa.port` → default)
- **createServer is synchronous**: No `await` needed
- **Rate limiting is opt-in**: Not enabled unless `security.rateLimit` is configured
- **CSP is always applied**: Uses restrictive defaults if not specified
- **Node.js >= 24.0.0 required**: Enforced in `package.json` engines
- **ESM project**: `"type": "module"` in package.json
- **Proxy route methods required**: `methods` array is required and must have at least one method
- **Proxy route target required**: `target` is required for proxy routes
- **API route handler required**: `handler` is required for API routes (filled by factory)
- **Route paths must start with /**: Validation throws otherwise
- **Proxy proxyPath must start with /**: If provided, validation throws otherwise

## Fallback: Reading Installed Package

If you need to verify types or behavior beyond what this skill covers, look in the consuming project's `node_modules/halide/`:

- `node_modules/halide/dist/index.d.ts` — all exported types and function signatures
- `node_modules/halide/dist/index.js` — ESM entry point
- `node_modules/halide/dist/index.cjs` — CJS entry point
- `node_modules/halide/package.json` — version, dependencies, exports map

The package exports `"."` (main entry) and `"./*"` (wildcard for any dist file).
