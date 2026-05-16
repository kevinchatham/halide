---
name: halide
description: Backend framework for building API backends and BFF layers with Hono, JWT auth, proxy routes, and OpenAPI/Scalar UI.
---

# Halide

A lightweight backend framework for Node.js built on Hono. Provides API routes, proxy forwarding, JWT auth, and auto-generated OpenAPI docs.

## Primary Resources

| Topic               | Docs                      | Reference                           |
| ------------------- | ------------------------- | ----------------------------------- |
| App Config          | `docs/0-app.md`           | `skill/references/config.md`        |
| API Routes          | `docs/1-api-routes.md`    | `skill/references/routes.md`        |
| Proxy Routes        | `docs/2-proxy-routes.md`  | `skill/references/routes.md`        |
| Authentication      | `docs/3-auth.md`          | `skill/references/auth.md`          |
| Security (CORS/CSP) | `docs/4-security.md`      | `skill/references/security.md`      |
| Observability       | `docs/5-observability.md` | `skill/references/observability.md` |
| OpenAPI/Scalar UI   | `docs/6-openapi.md`       | `skill/references/openapi.md`       |
| CLI                 | `docs/9-cli.md`           | —                                   |

## Complete Type Reference

```ts
import {
  apiRoute,
  proxyRoute,
  createApp,
  createServer,
  createDefaultLogger,
  createNoopLogger,
  createScopedLogger,
} from 'halide';
import type {
  ServerConfig,
  HalideContext,
  AppConfig,
  SecurityConfig,
  CorsConfig,
  CspDirectives,
  OpenApiConfig,
  OpenApiOptions,
  OpenApiRouteMeta,
  ObservabilityConfig,
  Logger,
  RequestContext,
  ResponseContext,
  ApiRoute,
  ApiRouteHandler,
  ProxyRoute,
  AuthorizeFn,
  TransformFn,
  ClaimExtractor,
  RegisterRoutesOptions,
  Server,
  CreateAppResult,
} from 'halide';
```

## Minimal Example

```ts
import { createServer, apiRoute } from 'halide';

const server = createServer({
  apiRoutes: [
    apiRoute({ access: 'public', path: '/health', handler: async () => ({ status: 'ok' }) }),
  ],
});
server.start();
```

## Key Gotchas

- **CSP uses camelCase** — `defaultSrc`, not `default-src`. Validator throws on kebab-case.
- **Wildcard CORS origin + `credentials: true`** is forbidden — validator throws.
- **Private routes require `security.auth`** — validator throws at startup if missing.
- **`ServerConfig` uses separate arrays** — `apiRoutes` and `proxyRoutes`, not a single `routes`.
- **`apiPrefix` defaults to `/api`** — paths under that prefix get 404 instead of app fallback. Set `apiPrefix: ''` to disable.
- **Proxy `timeout` defaults to 10000ms** (10s). Rate limit defaults: 100 requests per 900000ms (15 min).

## Fallback References

- Type declarations: `node_modules/halide/dist/index.d.ts`
- Runtime source: `node_modules/halide/dist/index.js`
