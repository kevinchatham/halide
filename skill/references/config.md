# Configuration Reference

## ServerConfig

The top-level configuration object passed to `createServer()`:

```typescript
type App = THalideApp<UserClaims>;

type ServerConfig<TApp = THalideApp> = {
  observability?: ObservabilityConfig<TApp>;
  apiRoutes?: ApiRoute<TApp, unknown, unknown>[];
  proxyRoutes?: ProxyRoute<TApp>[];
  security?: SecurityConfig;
  app?: AppConfig;
  openapi?: OpenApiConfig;
};
```

**Critical:** `ServerConfig` uses **separate arrays** — `apiRoutes` and `proxyRoutes`. There is no single `routes` array.

## THalideApp

Bundles claims and logger into a single object passed to handlers:

```typescript
type THalideApp<TClaims = unknown, TLogScope = unknown> = {
  claims: TClaims | undefined; // decoded JWT (undefined for public routes)
  logger: Logger<TLogScope>; // structured logger
};
```

## AppConfig (optional — for static file serving)

```typescript
type AppConfig = {
  apiPrefix?: string; // default: '/api' — paths with this prefix get 404 instead of app fallback
  fallback?: string; // default: 'index.html' — app fallback file for client-side routing
  name?: string; // default: 'app' — used in log messages
  port?: number; // default: 3553 — server listen port
  root?: string; // optional — omit for pure backend mode
};
```

## SecurityConfig

```typescript
type SecurityConfig = {
  auth?: SecurityAuthConfig;
  cors?: CorsConfig;
  csp?: CspOptions;
  rateLimit?: {
    maxRequests?: number; // default: 100
    windowMs?: number; // default: 900000 (15 minutes)
  };
};

type SecurityAuthConfig = {
  audience?: string;
  jwksUri?: string;
  strategy?: 'bearer' | 'jwks';
  secret?: () => string | Promise<string>;
  secretTtl?: number; // default: 60 (seconds)
};
```

## Key Types

| Type                             | Description                                                                   |
| -------------------------------- | ----------------------------------------------------------------------------- |
| `ServerConfig<TApp>`             | Top-level configuration object                                                |
| `THalideApp<TClaims, TLogScope>` | Bundled app context: `{ claims, logger }`                                     |
| `Server`                         | Server instance with `ready`, `start(onReady)`, `stop()`                      |
| `CreateAppResult`                | Return of `createApp()` — `{ app, rateLimitDispose }`                         |
| `ApiRoute<TApp, TBody>`          | API route definition                                                          |
| `ApiRouteHandler<TApp, TBody>`   | Handler signature: `(ctx, app) => Promise<unknown>`                           |
| `ProxyRoute<TApp>`               | Proxy route definition                                                        |
| `AuthorizeFn<TApp>`              | `(ctx, app) => boolean \| Promise<boolean>`                                   |
| `TransformFn`                    | `({ body, headers }) => { body, headers }`                                    |
| `RequestContext`                 | Normalized request context: `{ method, path, headers, params, query, body? }` |
| `SecurityConfig`                 | CORS, CSP, auth, rate limit configuration                                     |
| `SecurityAuthConfig`             | Auth strategy, secret/JWKS, audience                                          |
| `CorsConfig`                     | Origin, methods, credentials, headers                                         |
| `CspOptions`                     | CSP directives container                                                      |
| `CspDirectives`                  | CSP directive map (camelCase keys)                                            |
| `AppConfig`                      | Static file serving configuration                                             |
| `ObservabilityConfig<TApp>`      | Logger, requestId, lifecycle hooks                                            |
| `OpenApiConfig`                  | OpenAPI toggle, path, options                                                 |
| `OpenApiRouteMeta`               | Per-route OpenAPI metadata                                                    |
| `Logger<TLogScope>`              | `{ debug, error, info, warn }` interface                                      |
| `ClaimExtractor<TClaims>`        | Function to extract claims from a Hono Context                                |

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
