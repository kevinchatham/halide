---
name: halide
description: Backend framework for building API backends and BFF layers with Hono, JWT auth, proxy routes, and OpenAPI/Scalar UI.
---

# Halide

A lightweight backend framework for Node.js built on Hono. Provides API routes, proxy forwarding, JWT auth, and auto-generated OpenAPI docs.

## Primary Resources

| Topic                | Docs                             | Reference                           |
| -------------------- | -------------------------------- | ----------------------------------- |
| App Config           | `docs/0-app.md`                  | `skill/references/config.md`        |
| API Routes           | `docs/1-api-routes.md`           | `skill/references/routes.md`        |
| Proxy Routes         | `docs/2-proxy-routes.md`         | `skill/references/routes.md`        |
| Project Organization | `docs/3-project-organization.md` | —                                   |
| Authentication       | `docs/4-auth.md`                 | `skill/references/auth.md`          |
| Security (CORS/CSP)  | `docs/5-security.md`             | `skill/references/security.md`      |
| Observability        | `docs/6-observability.md`        | `skill/references/observability.md` |
| OpenAPI/Scalar UI    | `docs/7-openapi.md`              | `skill/references/openapi.md`       |
| Full Example         | `docs/8-full-example.md`         | —                                   |
| API Reference        | `docs/9-api-reference.md`        | —                                   |
| CLI                  | `docs/10-cli.md`                 | —                                   |
| Testing              | `docs/11-testing.md`             | `skill/references/testing.md`       |
| defineHalide Builder | `docs/12-define-halide.md`       | `skill/references/runtime.md`       |
| Validation           | —                                | `skill/references/validation.md`    |

## Complete Type Reference

```ts
import { defineHalide, createDefaultLogger, createNoopLogger, createScopedLogger } from 'halide';
import type {
  ServerConfig,
  HalideContext,
  AppConfig,
  SecurityConfig,
  SecurityAuthConfig,
  CorsConfig,
  CspDirectives,
  CspDirectiveValue,
  OpenApiConfig,
  OpenApiOptions,
  OpenApiRouteMeta,
  OpenApiSource,
  ResolvedOpenApiSpec,
  ObservabilityConfig,
  Logger,
  RequestContext,
  ResponseContext,
  ApiRoute,
  ApiRouteHandler,
  ApiRouteInput,
  ProxyRoute,
  ProxyRouteInput,
  AuthorizeFn,
  TransformFn,
  ClaimExtractor,
  Server,
  CreateAppResult,
} from 'halide';
```

Note: `createApp` and `createServer` are NOT direct exports — they come from the `defineHalide()` builder pattern.

## Minimal Example

```ts
import { defineHalide } from 'halide';

const { apiRoute, createServer } = defineHalide();

const server = createServer({
  apiRoutes: [
    apiRoute({
      access: 'public',
      path: '/health',
      handler: async () => ({ status: 'ok' }),
    }),
  ],
});
server.start();
```

## Key Gotchas

- **CSP uses camelCase** — `defaultSrc`, not `default-src`. Validator throws on kebab-case.
- **Wildcard CORS origin + `credentials: true`** is forbidden — validator throws.
- **CSRF auto-enabled** — when `credentials: true`, CSRF protection is automatically added using `hono/csrf` with CORS origins.
- **Private routes require `security.auth`** — validator throws at startup if missing.
- **`ServerConfig` uses separate arrays** — `apiRoutes` and `proxyRoutes`, not a single `routes`.
- **`apiPrefix` defaults to `/api`** — paths under that prefix get 404 instead of app fallback. Set `apiPrefix: ''` to disable.
- **Proxy `timeout` defaults to 10000ms** (10s). Rate limit defaults: 100 requests per 900000ms (15 min).
- **Rate limit `maxEntries` defaults to 10000** — max store entries; oldest evicted when exceeded.
- **`defineHalide()` is the entry point** — `createApp` and `createServer` are returned by the builder, not direct imports.

## Fallback References

- Type declarations: `node_modules/halide/dist/index.d.ts`
- Runtime source: `node_modules/halide/dist/index.js`
