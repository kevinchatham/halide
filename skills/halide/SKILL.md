---
name: halide
description: Build Hono-based BFF (Backend for Frontend) servers with Halide — routing, auth, proxying, SPA serving, middleware, OpenAPI, and observability
---

## Overview

Halide is a declarative BFF (Backend for Frontend) runtime built on Hono. It standardizes how SPAs communicate with backend services by providing a shared, predictable structure for auth, routing, proxying, and security.

**When to use:** You have a SPA (Angular, React, Vue, Svelte) and need a BFF layer between it and your backend services.

**When not to use:** You need direct HTTP layer control, multi-service routing, circuit breakers, load balancing, or TLS termination — use an API gateway or service mesh instead.

## Installation

```bash
npm install halide
```

Or use the CLI to scaffold a server:

```bash
npx halide init
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

## Exports

All imports come from `'halide'`:

| Export                                                  | Description                                                                                                  |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `createServer<TClaims>(config)`                         | Creates a server instance. Returns `{ ready, start, stop }`. Synchronous.                                    |
| `createApp<TClaims>(config)`                            | Creates a Hono app without starting an HTTP server. Returns `{ app, rateLimitDispose }`. Useful for testing. |
| `apiRoute<TClaims, TBody>(input)`                       | Factory that fills in `type: 'api'` and default `authorize`.                                                 |
| `proxyRoute<TClaims>(input)`                            | Factory that fills in `type: 'proxy'` and default `authorize`.                                               |
| `inferSchema<TRequest, TResponse>(request?, response?)` | Helper that sets both `validationSchema` and `openapi` schemas from Zod schemas, eliminating duplication.    |

## Server Lifecycle

```typescript
const server = createServer(config);
server.start((port) => {
  console.log(`Listening on ${port}`);
});
await server.ready;
await server.stop(); // graceful shutdown
```

- `createServer()` is **synchronous** — no `await` needed
- SIGINT/SIGTERM are handled automatically

## Error Handling

All unhandled errors are caught and return `500 Internal Server Error` with `{ error: 'Internal Server Error' }`. Errors are logged via the configured logger.

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
- **Proxy route methods required**: `methods` array is required and must have at least one method
- **Route paths must start with /**: Validation throws otherwise
- **Proxy host header**: The original `Host` header is NOT forwarded — it's derived from the target URL. Original host is preserved as `X-Forwarded-Host`
- **Proxy readonly headers**: `host`, `connection`, `content-length`, `transfer-encoding`, `set-cookie` cannot be overridden by `identity` or `transform`
- **Bearer secret caching**: `secretTtl` defaults to 60 seconds. Set to 0 to disable caching
- **OpenAPI CSP warning**: When OpenAPI is enabled, Scalar UI routes use relaxed CSP; custom CSP does not apply to those routes. A warning is logged at startup

## Reference Files

- [Configuration](references/config.md) — ServerConfig, SpaConfig, SecurityConfig, types
- [Authentication](references/auth.md) — Bearer, JWKS, authorization functions, claims
- [Routes](references/routes.md) — API routes, proxy routes, path rewriting, identity, transform
- [Security](references/security.md) — CORS, CSP (directives table), rate limiting
- [Observability](references/observability.md) — Logger, lifecycle hooks, request ID
- [OpenAPI](references/openapi.md) — OpenAPI configuration, per-route metadata

## Fallback: Reading Installed Package

If you need to verify types or behavior beyond what this skill covers, look in the consuming project's `node_modules/halide/`:

- `node_modules/halide/dist/index.d.ts` — all exported types and function signatures
- `node_modules/halide/dist/index.js` — ESM entry point
- `node_modules/halide/package.json` — version, dependencies, exports map
