# Configuration Reference

## ServerConfig

The top-level configuration object passed to `createServer()`:

```typescript
interface ServerConfig<TClaims = unknown> {
  app?: AppConfig; // optional — server can run as pure backend without static files
  apiRoutes?: ApiRoute<TClaims>[]; // optional array
  proxyRoutes?: ProxyRoute<TClaims>[]; // optional array
  security?: SecurityConfig; // optional
  observability?: ObservabilityConfig<TClaims>; // optional
  openapi?: OpenApiConfig; // optional
}
```

**Critical:** `ServerConfig` uses **separate arrays** — `apiRoutes` and `proxyRoutes`. There is no single `routes` array.

## AppConfig (optional — for static file serving)

```typescript
interface AppConfig {
  root?: string; // optional — omit for pure backend mode
  name?: string; // default: 'app' — used in log messages
  port?: number; // default: 3553 — server listen port
  fallback?: string; // default: 'index.html' — app fallback file
  apiPrefix?: string; // default: '/api' — paths starting with this get 404 instead of app fallback. Set to '' to disable.
}
```

## SecurityConfig

```typescript
interface SecurityConfig {
  auth?: SecurityAuthConfig;
  cors?: CorsConfig;
  csp?: CspOptions;
  rateLimit?: { maxRequests?: number; windowMs?: number };
}

interface SecurityAuthConfig {
  strategy?: 'bearer' | 'jwks';
  secret?: () => string | Promise<string>; // required for bearer
  secretTtl?: number; // default: 60 (seconds). 0 to disable caching
  jwksUri?: string; // required for jwks
  audience?: string; // optional: validates aud claim
}
```

## Key Types

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
| `AppConfig`                       | Static file serving configuration                                             |
| `ObservabilityConfig<TClaims>`    | Logger, requestId, lifecycle hooks                                            |
| `OpenApiConfig`                   | OpenAPI toggle, path, options                                                 |
| `OpenApiRouteMeta`                | Per-route OpenAPI metadata                                                    |
| `Logger`                          | `{ debug, error, info, warn }` interface                                      |
| `ClaimExtractor<TClaims>`         | Function to extract claims from a Hono Context                                |

## App Configuration

Serves static files from the `root` directory when provided. When `root` is omitted, the server operates as a pure backend without static file serving. Non-file requests fall back to the app's `fallback` file (default: `index.html`).

```typescript
app: {
  root: 'dist',             // optional — omit for pure backend mode
  name: 'my-app',           // default: 'app' — used in log messages
  port: 3553,               // default: 3553
  fallback: 'index.html',   // default: 'index.html'
  apiPrefix: '/api',        // default: '/api' — paths starting with this get 404 instead of app fallback
}
```

The `apiPrefix` prevents API requests from accidentally returning the app HTML. Set to `''` (empty string) to disable this behavior.

Port resolution: `PORT` env variable → `app.port` config → default **3553**.
