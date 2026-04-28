---
name: halide
description: Declarative BFF runtime for SPAs with auth, proxy, CSP, rate limiting, and OpenAPI support
---

# Halide Skill

## Overview

Halide is a declarative BFF (Backend for Frontend) runtime built on [Hono](https://hono.dev). It standardizes SPA communication by providing JWT authentication (bearer/JWKS), upstream proxying with path rewriting, Content Security Policy (CSP), rate limiting, and OpenAPI/Scalar documentation.

Use Halide when you need to:

- Host a static SPA (React, Vue, Svelte, Angular) with a production-ready server
- Protect API routes with JWT authentication
- Proxy requests to upstream APIs with identity injection and request transformation
- Apply security headers (CSP, CORS) with minimal configuration
- Generate OpenAPI documentation automatically from route schemas

## Quick Start

```ts
import { createServer, apiRoute } from 'halide';

const server = createServer({
  app: { root: 'dist', port: 3000 },
  apiRoutes: [
    apiRoute({
      access: 'public',
      handler: async (ctx) => ({ status: 'ok' }),
      path: '/health',
    }),
  ],
});

server.start((port) => console.log(`Server running on port ${port}`));
```

## Exports

```ts
import {
  createApp, // Create configured Hono app (for testing/custom servers)
  createServer, // Create server with lifecycle management
  apiRoute, // Factory for API routes
  proxyRoute, // Factory for proxy routes
  // Types:
  type ApiRoute,
  type ApiRouteHandler,
  type AuthorizeFn,
  type ClaimExtractor,
  type CorsConfig,
  type CspDirectives,
  type CspOptions,
  type Logger,
  type ObservabilityConfig,
  type OpenApiConfig,
  type OpenApiRouteMeta,
  type ProxyRoute,
  type RequestContext,
  type SecurityAuthConfig,
  type SecurityConfig,
  type ServerConfig,
  type AppConfig,
  type TransformFn,
} from 'halide';
```

## Reference Documents

Detailed documentation for each topic:

| Document                                                     | Description                                                  |
| ------------------------------------------------------------ | ------------------------------------------------------------ |
| [references/config.md](./references/config.md)               | ServerConfig, AppConfig, all type definitions                |
| [references/routes.md](./references/routes.md)               | apiRoute(), proxyRoute(), handler signatures, path rewriting |
| [references/auth.md](./references/auth.md)                   | Bearer/JWKS strategies, authorization functions              |
| [references/security.md](./references/security.md)           | CORS, CSP (camelCase), rate limiting                         |
| [references/observability.md](./references/observability.md) | Logger, requestId, onRequest/onResponse hooks                |
| [references/openapi.md](./references/openapi.md)             | Scalar UI, response schemas, per-route metadata              |

## Type Reference

**Primary source of truth**: `node_modules/halide/dist/index.d.ts`

```bash
cat node_modules/halide/dist/index.d.ts
cat node_modules/halide/dist/index.js
```

## Key Patterns

### Private Route with JWT Auth

```ts
createServer({
  app: { root: 'dist' },
  security: {
    auth: {
      strategy: 'bearer',
      secret: () => process.env.JWT_SECRET!,
      audience: 'my-app',
    },
  },
  apiRoutes: [
    apiRoute({
      access: 'private',
      path: '/profile',
      handler: async (ctx, claims) => ({ userId: claims?.sub }),
    }),
  ],
});
```

### Proxy with Identity Injection

```ts
proxyRoute({
  access: 'private',
  path: '/api/*',
  methods: ['get', 'post'],
  target: 'https://backend.example.com',
  identity: (ctx, claims) => ({ 'x-user-id': claims.sub }),
});
```

### App with API Prefix

```ts
app: {
  root: 'dist',
  apiPrefix: '/api',  // Default — paths starting with /api get 404
}
```

## Common Gotchas

1. **Route paths must start with `/`** — validator throws otherwise
2. **Private routes require `security.auth`** — validator throws if missing
3. **Bearer strategy requires `secret`** — JWKS requires `jwksUri`
4. **Wildcard origin + `credentials: true`** — CORS validator throws
5. **CSP directives must use camelCase** — `defaultSrc`, not `default-src`
6. **Proxy routes require `methods` array** — at least one required
7. **OpenAPI UI uses relaxed CSP** — should be disabled in production
