---
name: halide
description: Build Hono-based API and proxy servers with Halide — routing, auth, SPA serving, middleware, OpenAPI, and observability
---

# Halide

## Quick Start

`spa.root` is the **only required field** in the entire `ServerConfig`:

```ts
import { createServer } from 'halide';

const server = await createServer({
  spa: { root: 'dist' },
});
```

This starts a server on port 3553 serving static files from `dist/` with SPA fallback, CORS, and a restrictive CSP policy — all applied by default.

## ServerConfig

```ts
const config: ServerConfig<UserClaims> = {
  spa: { root: 'dist/browser' }, // required
  apiRoutes: [], // optional
  proxyRoutes: [], // optional
  security: {
    // optional
    auth: { strategy: 'bearer', secret: () => process.env.JWT_SECRET ?? '' },
    cors: { credentials: true, origin: ['http://localhost:4200'] },
    csp: { directives: { defaultSrc: ["'self'"] } },
    rateLimit: { maxRequests: 100, windowMs: 900_000 },
  },
  observability: { logger: console, requestId: true },
  openapi: { enabled: true, path: '/docs' },
};
```

| Key             | Required | Description                                  |
| --------------- | -------- | -------------------------------------------- |
| `spa`           | **Yes**  | SPA/static file config — `root` is mandatory |
| `apiRoutes`     | No       | Array of API route definitions               |
| `proxyRoutes`   | No       | Array of proxy route definitions             |
| `security`      | No       | Auth, CORS, CSP, and rate limiting           |
| `observability` | No       | Logger, request/response hooks, request ID   |
| `openapi`       | No       | OpenAPI spec + Scalar UI                     |

## createServer vs createApp

|                 | `createServer<TClaims>()`                   | `createApp<TClaims>()`                                     |
| --------------- | ------------------------------------------- | ---------------------------------------------------------- |
| Returns         | `Promise<Server>` with `start()` / `stop()` | `Promise<CreateAppResult>` with `app` + `rateLimitDispose` |
| Use when        | Production, simple start/stop lifecycle     | Testing, custom Hono server, programmatic access           |
| Port resolution | `process.env.PORT` → `spa.port` → `3553`    | None — you bind the Hono app yourself                      |

`createApp` returns `rateLimitDispose` — call it in test teardown to clean up rate-limit timers.

## Route Factories

Use `apiRoute()` and `proxyRoute()` factory functions — they auto-fill `type` and default `authorize` to allow all authenticated users:

```ts
import { apiRoute, proxyRoute } from 'halide';

apiRoute({
  path: '/health',
  access: 'public',
  handler: async () => ({ status: 'ok' }),
});

proxyRoute({
  path: '/api/users',
  target: 'https://backend.example.com',
  methods: ['get', 'post'],
  access: 'private',
});
```

Prefer factories over raw route objects.

## API Routes

```ts
apiRoute({
  path: '/users/:id', // must start with /
  method: 'get', // defaults to 'get' if omitted
  access: 'private', // 'public' | 'private'
  authorize: (ctx, claims, logger) => claims?.role === 'admin',
  handler: async (ctx, claims, logger) => ({ user: claims?.sub }),
  validationSchema: z.object({ name: z.string() }), // Zod schema for body
  openapi: { summary: 'Get user', tags: ['users'] },
  observe: false, // suppress observability hooks + hide from OpenAPI
});
```

- Handler signature: `(ctx: RequestContext & { body: TBody }, claims: TClaims | undefined, logger: Logger) => Promise<unknown>`
- `ctx` is a plain object — not a Hono Context
- When `validationSchema` is provided, the body is validated against the Zod schema before the handler runs

## Proxy Routes

```ts
proxyRoute({
  path: '/api/users', // must start with /
  target: 'https://backend.example.com', // required
  methods: ['get', 'post'], // required — at least one
  access: 'private',
  proxyPath: '/internal/users', // optional path rewrite
  timeout: 30_000, // optional, defaults to 60_000ms
  identity: (ctx, claims) => ({ 'x-user-id': claims.sub }), // inject headers
  transform: ({ body, headers }) => ({ body: { ...body, extra: true }, headers }),
});
```

### Path Rewriting

- Without `proxyPath`: `/api/users/123` → `https://backend.example.com/api/users/123`
- With `proxyPath: '/internal/users'`: `/api/users/123` → `https://backend.example.com/internal/users/123`
- Query strings are preserved

### Identity Injection

`identity(ctx, claims)` returns headers to inject into the proxied request. Only runs when claims exist.

### Transform

`transform({ body, headers })` lets you modify the request body and headers before forwarding.

## Authentication

Auth is configured under `security.auth` (nested, not a top-level key):

```ts
security: {
  auth: {
    strategy: 'bearer',  // or 'jwks'
    secret: () => process.env.JWT_SECRET ?? '',
  },
}
```

### Bearer JWT Strategy

- Set `strategy: 'bearer'`
- `secret` — function returning the JWT secret string (can be async), **required** for bearer
- Optional `audience` — validates the `aud` claim in the token
- Uses `hono/jwt` for verification — not `jose`

```ts
security: {
  auth: {
    strategy: 'bearer',
    secret: () => process.env.JWT_SECRET ?? '',
    audience: 'https://api.example.com',
  },
}
```

### JWKS Strategy

- Set `strategy: 'jwks'`
- `jwksUri` — URL to the JWKS endpoint, **required** for JWKS
- Optional `audience` for token audience validation
- Uses `hono/jwk` — not `jose`

```ts
security: {
  auth: {
    strategy: 'jwks',
    jwksUri: 'https://your-tenant.auth0.com/.well-known/jwks.json',
    audience: 'https://api.example.com',
  },
}
```

### Route Access Control

- `access: 'public'` — no authentication required
- `access: 'private'` — requires a valid JWT; returns `401 Unauthorized` if missing/invalid

### Authorization Callback

`authorize(ctx, claims, logger) => boolean | Promise<boolean>` enables role-based access control:

- Return `true` to allow, `false` to deny (`403 Forbidden`)
- Defaults to allowing all authenticated users
- Throws/errors in `authorize` also result in `403`

```ts
apiRoute({
  access: 'private',
  authorize: (ctx, claims, logger) => claims?.role === 'admin',
  handler: async (ctx, claims) => ({ data: 'secret' }),
  path: '/admin',
}),
```

## Security Middleware

### CORS

Always applied. Defaults:

| Option           | Default                                     |
| ---------------- | ------------------------------------------- |
| `origin`         | `['*']`                                     |
| `methods`        | `['get', 'post', 'put', 'delete', 'patch']` |
| `credentials`    | `false`                                     |
| `allowedHeaders` | undefined                                   |
| `exposedHeaders` | undefined                                   |
| `maxAge`         | undefined                                   |

**Gotcha**: Wildcard origin (`'*'` or `['*']`) cannot be combined with `credentials: true` — validation will throw.

### CSP

Always applied, even without explicit config. Falls back to a restrictive default policy with ~20 directives including:

- `defaultSrc: ['self']`, `scriptSrc: ['self']`, `styleSrc: ['self', 'https:', 'unsafe-inline']`
- `objectSrc: ['none']`, `frameAncestors: ['self']`, `baseUri: ['self']`
- `upgradeInsecureRequests` enabled

CSP directives must use **camelCase** (`defaultSrc`), not kebab-case (`default-src`) — validation will throw on kebab.

Override the entire directives object via `security.csp.directives`.

### Rate Limiting

**Opt-in** — only activates when `security.rateLimit` is truthy. Unlike CORS/CSP, it is not applied by default.

| Option        | Default          | Description                    |
| ------------- | ---------------- | ------------------------------ |
| `maxRequests` | 100              | Max requests per window per IP |
| `windowMs`    | 900,000 (15 min) | Sliding window duration in ms  |

```ts
security: {
  rateLimit: { maxRequests: 50, windowMs: 60_000 },
}
```

## SPA Serving

The `spa` property is **required** in `ServerConfig`:

```ts
spa: {
  root: 'dist',          // required — path to static assets
  name: 'my-app',        // optional — used in startup log, defaults to 'app'
  fallback: 'index.html', // optional — defaults to 'index.html'
  apiPrefix: '/api',     // optional — defaults to '/api'
  port: 4200,            // optional — overrides server port
}
```

### apiPrefix Behavior

- Paths starting with `apiPrefix` get **404** instead of SPA fallback
- This prevents API routes from being caught by the SPA catch-all
- Set `apiPrefix: ''` to **disable** the 404 behavior entirely

### Framework-Specific Root Directories

- **Angular**: `root: 'dist/browser'` (after `ng build`)
- **React/Vite**: `root: 'dist'` (after `vite build`)
- **Vue/Vite**: `root: 'dist'` (after `vite build`)

## OpenAPI

OpenAPI spec generation and interactive API documentation via **Scalar** (not Swagger UI):

```ts
openapi: {
  enabled: true,
  path: '/docs',       // defaults to '/swagger'
  options: {
    title: 'My API',
    version: '2.0.0',
    description: 'API docs',
    servers: [{ url: 'https://api.example.com' }],
  },
}
```

When `enabled: true`, two routes are created:

- `GET {path}/openapi.json` — the OpenAPI spec
- `GET {path}` — Scalar interactive UI

### Route-Level Schema Declarations

```ts
apiRoute({
  path: '/users',
  method: 'post',
  access: 'public',
  handler: async (ctx) => ctx.body,
  validationSchema: CreateUserSchema,     // request body validation + OpenAPI schema
  openapi: {
    summary: 'Create user',
    tags: ['users'],
    responseSchema: UserSchema,           // shorthand for 200 response
    responses: {                          // full response map
      201: { description: 'Created', schema: UserSchema },
      400: { description: 'Bad request' },
    },
  },
}),
```

- `validationSchema` — Zod schema for request body; also generates the OpenAPI request body schema
- `openapi.responseSchema` — shorthand for a single 200 response schema
- `openapi.responses` — full map of status codes to `{ description, schema? }`
- If neither `responseSchema` nor `responses` is set, a default `200 { description: 'Successful response' }` is generated

`observe: false` on a route hides it from the OpenAPI spec entirely.

## Observability

```ts
observability: {
  logger: console,               // must satisfy Logger interface
  requestId: true,               // adds X-Request-Id header
  onRequest: (ctx, claims, logger) => { /* log incoming request */ },
  onResponse: (ctx, claims, response, logger) => {
    // response.statusCode, response.durationMs, response.error?
  },
}
```

- `logger` — defaults to a no-op logger. Must implement `debug`, `error`, `info`, `warn`
- `requestId` — generates a unique `X-Request-Id` header per request when `true`
- `onRequest(ctx, claims, logger)` — called before the handler
- `onResponse(ctx, claims, response, logger)` — called after the handler completes (even on error)
- `observe: false` on a route suppresses both hooks and hides it from OpenAPI

## Gotchas

- **Node.js >=24.0.0 required** (enforced in `engines`)
- **No `console.log`** — Biome enforces `noConsole`; use the `Logger` interface
- CORS wildcard origin (`*`) cannot be combined with `credentials: true` — validation will throw
- Private routes require `security.auth` — validation will throw otherwise
- CSP directives must use camelCase (`defaultSrc`), not kebab-case (`default-src`)
- CSP is always applied even without explicit config — restrictive default policy
- Rate limiting is opt-in (only when `security.rateLimit` is truthy), unlike CORS/CSP
- `claims` is `TClaims | undefined` — always handle the `undefined` case
- `apiRoute.method` defaults to `'get'` if omitted; `proxyRoute.methods` is required
- SPA `apiPrefix` defaults to `'/api'` — paths starting with that prefix get 404 instead of SPA fallback
- `observe: false` suppresses both observability hooks AND hides the route from OpenAPI spec
- Default server port is 3553, resolved as: `process.env.PORT` → `spa.port` → `3553`

## Exported API Reference

### Functions

| Function                          | Description                                               |
| --------------------------------- | --------------------------------------------------------- |
| `createServer<TClaims>(config)`   | Create a server with `start()`/`stop()` lifecycle         |
| `createApp<TClaims>(config)`      | Create a Hono app + `rateLimitDispose` (no HTTP listener) |
| `apiRoute<TClaims, TBody>(route)` | Factory for API route definitions                         |
| `proxyRoute<TClaims>(route)`      | Factory for proxy route definitions                       |

### Types

| Type                              | Description                                                                  |
| --------------------------------- | ---------------------------------------------------------------------------- |
| `Server`                          | Return type of `createServer` — `{ start, stop }`                            |
| `CreateAppResult`                 | Return type of `createApp` — `{ app, rateLimitDispose }`                     |
| `ServerConfig<TClaims>`           | Full server configuration                                                    |
| `SpaConfig`                       | SPA/static serving config — `root` is required                               |
| `ApiRoute<TClaims, TBody>`        | API route definition                                                         |
| `ProxyRoute<TClaims>`             | Proxy route definition                                                       |
| `SecurityConfig`                  | Security configuration (auth, CORS, CSP, rate limit)                         |
| `SecurityAuthConfig`              | Auth configuration (`strategy`, `secret`, `jwksUri`, `audience`)             |
| `CorsConfig`                      | CORS configuration                                                           |
| `CspDirectives`                   | CSP directive map (camelCase keys)                                           |
| `CspOptions`                      | CSP options — `{ directives?: CspDirectives }`                               |
| `OpenApiConfig`                   | OpenAPI configuration (`enabled`, `path`, `options`)                         |
| `OpenApiRouteMeta`                | Route-level OpenAPI metadata                                                 |
| `ObservabilityConfig<TClaims>`    | Observability configuration                                                  |
| `RequestContext`                  | Request data passed to handlers (method, path, headers, params, query, body) |
| `ApiRouteHandler<TClaims, TBody>` | API route handler — `(ctx, claims, logger) => Promise<unknown>`              |
| `AuthorizeFn<TClaims>`            | Authorization callback — `(ctx, claims, logger) => boolean \| Promise<boolean>` |
| `ClaimExtractor<TClaims>`         | Internal type for claim extraction from Hono Context                         |
| `TransformFn`                     | Proxy request transform — `({ body, headers }) => { body, headers }`         |
| `Logger`                          | Logger interface — `debug`, `error`, `info`, `warn`                          |
