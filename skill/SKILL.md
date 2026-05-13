---
name: halide
description: Halide BFF framework — server creation, API/proxy routes, auth, security, observability
---

# Halide Agent Guide

## Primary Resources

| Topic                            | File                                               |
| -------------------------------- | -------------------------------------------------- |
| App hosting                      | [docs/0-app.md](docs/0-app.md)                     |
| API routes                       | [docs/1-api-routes.md](docs/1-api-routes.md)       |
| Proxy routes                     | [docs/2-proxy-routes.md](docs/2-proxy-routes.md)   |
| Auth & authorization             | [docs/3-auth.md](docs/3-auth.md)                   |
| Security (CORS, CSP, rate limit) | [docs/4-security.md](docs/4-security.md)           |
| Observability                    | [docs/5-observability.md](docs/5-observability.md) |
| OpenAPI / Scalar UI              | [docs/6-openapi.md](docs/6-openapi.md)             |
| Full example                     | [docs/7-full-example.md](docs/7-full-example.md)   |
| API reference                    | [docs/8-api-reference.md](docs/8-api-reference.md) |
| CLI                              | [docs/9-cli.md](docs/9-cli.md)                     |

## Detailed References

| Topic         | File                                                                   | Source                                                                     |
| ------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Config types  | [skill/references/config.md](skill/references/config.md)               | `src/types/server-config.ts`, `src/types/app.ts`, `src/config/defaults.ts` |
| Route types   | [skill/references/routes.md](skill/references/routes.md)               | `src/routes/apiRoute.ts`, `src/routes/proxyRoute.ts`, `src/types/api.ts`   |
| Auth          | [skill/references/auth.md](skill/references/auth.md)                   | `src/middleware/auth.ts`, `src/routes/registry.auth.ts`                    |
| Security      | [skill/references/security.md](skill/references/security.md)           | `src/types/security.ts`, `src/types/csp.ts`, `src/middleware/security.ts`  |
| OpenAPI       | [skill/references/openapi.md](skill/references/openapi.md)             | `src/types/openapi.ts`, `src/routes/registry.openapi.ts`                   |
| Observability | [skill/references/observability.md](skill/references/observability.md) | `src/types/app.ts`, `src/routes/registry.auth.ts`                          |

## Type Reference

```ts
import type {
  ApiRoute,
  ApiRouteHandler,
  ApiRouteInput,
  AuthorizeFn,
  ProxyRoute,
  ProxyRouteInput,
  TransformFn,
  CspDirectiveValue,
  CspDirectives,
  CspOptions,
  OpenApiConfig,
  OpenApiOptions,
  OpenApiRouteMeta,
  OpenApiSource,
  ResolvedOpenApiSpec,
  ClaimExtractor,
  CorsConfig,
  SecurityAuthConfig,
  SecurityConfig,
  AppConfig,
  Logger,
  ObservabilityConfig,
  RequestContext,
  ResponseContext,
  THalideApp,
  ServerConfig,
  Server,
  CreateAppResult,
} from 'halide';
import { createApp, createServer, apiRoute, proxyRoute } from 'halide';
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

- CSP directive keys must use **camelCase** (`defaultSrc`), not kebab-case (`default-src`) — validator throws
- Wildcard CORS origin (`'*'`) cannot be combined with `credentials: true` — validator throws
- Private routes require `security.auth` configured — validation throws if missing
- `ServerConfig` uses separate `apiRoutes` and `proxyRoutes` arrays, not a single `routes` array
- `apiRoute.method` is optional (defaults to `'get'`); `proxyRoute.methods` is required (array)
- Proxy route strips `host`, `connection`, `content-length`, `transfer-encoding`, `set-cookie` headers
- OpenAPI UI disabled by default — warns about relaxed CSP; should be disabled in production
- `onRequest`/`onResponse` hooks fire per-route; set `observe: false` to skip
- `apiPrefix` defaults to `'/api'` — paths with this prefix get 404; set `''` to disable

## Fallback Reference

- `node_modules/halide/dist/index.d.ts` — full TypeScript types
- `node_modules/halide/dist/index.js` — runtime behavior
