---
name: halide
description: A declarative BFF runtime with auth, proxy, CSP, rate limiting, and OpenAPI support
---

# Halide Skill

A consuming agent should load this skill to build Halide servers.

## Primary Resources

| Topic                                    | Guide                     |
| ---------------------------------------- | ------------------------- |
| Quick start, full examples               | `docs/7-full-example.md`  |
| API route factory, handler signature     | `docs/1-api-routes.md`    |
| Proxy routing, path rewriting, transform | `docs/2-proxy-routes.md`  |
| Auth strategies (bearer/JWKS), audience  | `docs/3-auth.md`          |
| CORS, CSP (camelCase), rate limiting     | `docs/4-security.md`      |
| Logger, requestId, onRequest/onResponse  | `docs/5-observability.md` |
| OpenAPI/Scalar UI, per-route metadata    | `docs/6-openapi.md`       |
| Static serving, apiPrefix, fallback      | `docs/0-app.md`           |
| CLI commands                             | `docs/9-cli.md`           |

## Detailed References

| Topic                               | Reference                           |
| ----------------------------------- | ----------------------------------- |
| Complete ServerConfig, all types    | `skill/references/config.md`        |
| Auth config, bearer/JWKS extraction | `skill/references/auth.md`          |
| Security middleware, CSP directives | `skill/references/security.md`      |
| Observability hooks                 | `skill/references/observability.md` |
| OpenAPI route metadata              | `skill/references/openapi.md`       |
| Route factories, path patterns      | `skill/references/routes.md`        |

## Complete Type Reference

```ts
import {
  createApp, // Returns { app, rateLimitDispose }
  createServer, // Returns Server with start/stop
  apiRoute, // Factory for API routes (type: 'api')
  proxyRoute, // Factory for proxy routes (type: 'proxy')
  type ServerConfig, // Root config type
  type THalideApp, // Bundled app context: { claims, logger }
  type ApiRoute, // API route definition
  type ApiRouteHandler, // (ctx, app) => Promise<T>
  type ProxyRoute, // Proxy route definition
  type RequestContext, // Normalized context for handlers
  type AuthorizeFn, // (ctx, app) => boolean
  type TransformFn, // Transform request body/headers
  type SecurityConfig, // auth + cors + csp + rateLimit
  type CorsConfig,
  type CspDirectives,
  type Logger,
  type ObservabilityConfig,
  type OpenApiConfig,
  type OpenApiRouteMeta,
} from 'halide';
```

## Minimal Example

```ts
import { createServer, apiRoute } from 'halide';

createServer({
  apiRoutes: [
    apiRoute({
      access: 'public',
      path: '/health',
      handler: async () => ({ status: 'ok' }),
    }),
  ],
}).start();
```

## Key Gotchas

1. **CSP uses camelCase** — `defaultSrc`, not `default-src`
2. **Wildcard origin** cannot be `'*'` when `credentials: true`
3. **Private routes** require `security.auth` configured
4. **Bearer requires secret**, **JWKS requires jwksUri**
5. **OpenAPI enabled** warns about relaxed CSP — disable in production
6. **apiPrefix** returns 404 for paths starting with it when `app.root` is set
7. **Handlers receive `app`** — not separate `claims` and `logger`; use `app.claims` and `app.logger`

## Fallback Reference

For complete type information, read:

- `node_modules/halide/dist/index.d.ts` — Type definitions
- `node_modules/halide/dist/index.js` — Implementation
- `node_modules/halide/dist/docs/*.md` — Documentation
