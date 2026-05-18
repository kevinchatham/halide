# Configuration Reference

## ServerConfig

The top-level configuration object passed to `createServer()`:

```typescript
type ServerConfig<TClaims = unknown, TLogScope = unknown> = {
  observability?: ObservabilityConfig<TClaims, TLogScope>;
  apiRoutes?: ApiRoute<TClaims, TLogScope, unknown, unknown>[];
  proxyRoutes?: ProxyRoute<TClaims, TLogScope>[];
  security?: SecurityConfig;
  app?: AppConfig;
  openapi?: OpenApiConfig;
};
```

**Critical:** `ServerConfig` uses **separate arrays** — `apiRoutes` and `proxyRoutes`. There is no single `routes` array.

## HalideContext

Bundles claims and logger into a single object passed to handlers:

```typescript
type HalideContext<TClaims = unknown, TLogScope = unknown> = {
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
  csp?: CspDirectives;
  rateLimit?: {
    maxRequests?: number; // default: 100
    windowMs?: number; // default: 900000 (15 minutes)
    trustedProxies?: string[]; // optional — trust x-forwarded-for from these IPs/CIDRs
    maxEntries?: number; // default: 10000 — max store entries; oldest evicted
    redisClient?: RedisClient; // optional — distributed rate limiting
  };
};

type SecurityAuthConfig = {
  audience?: string;
  jwksUri?: string;
  strategy?: 'bearer' | 'jwks';
  secret?: string | (() => string | Promise<string>);
  secretTtl?: number; // default: 60 (seconds)
  algorithms?: string[]; // default: ['HS256']
};
```

## Key Types

| Type                                                    | Description                                                                   |
| ------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `ServerConfig<TClaims, TLogScope>`                      | Top-level configuration object                                                |
| `HalideContext<TClaims, TLogScope>`                     | Bundled app context: `{ claims, logger }`                                     |
| `Server`                                                | Server instance with `ready`, `start(onReady)`, `stop()`                      |
| `CreateAppResult`                                       | Return of `createApp()` — `{ app, logger, proxyDispose, rateLimitDispose }`   |
| `ApiRoute<TClaims, TLogScope, TBody, TResponse>`        | API route definition                                                          |
| `ApiRouteHandler<TClaims, TLogScope, TBody, TResponse>` | Handler signature: `(ctx, app) => Promise<TResponse \| Response>`             |
| `ApiRouteInput<TClaims, TLogScope, TBody, TResponse>`   | Input for `apiRoute()` factory — omits `type`, requires `handler`             |
| `ProxyRoute<TClaims, TLogScope>`                        | Proxy route definition                                                        |
| `ProxyRouteInput<TClaims, TLogScope>`                   | Input for `proxyRoute()` factory — omits `type`                               |
| `AuthorizeFn<TClaims, TLogScope>`                       | `(ctx, app) => boolean \| Promise<boolean>`                                   |
| `TransformFn`                                           | `({ method, body, headers }) => { body, headers }`                            |
| `RequestContext`                                        | Normalized request context: `{ method, path, headers, params, query, body? }` |
| `ResponseContext`                                       | `{ statusCode, durationMs, error?, body?, bodyType? }`                        |
| `SecurityConfig`                                        | CORS, CSP, auth, rate limit configuration                                     |
| `SecurityAuthConfig`                                    | Auth strategy, secret/JWKS, audience, algorithms                              |
| `CorsConfig`                                            | Origin, methods, credentials, headers                                         |
| `CspDirectives`                                         | CSP directive map (camelCase keys)                                            |
| `CspDirectiveValue`                                     | `string \| ContentSecurityPolicyOptionHandler`                                |
| `AppConfig`                                             | Static file serving configuration                                             |
| `ObservabilityConfig<TClaims, TLogScope>`               | Logger, requestId, lifecycle hooks, logScopeFactory, maxCollect               |
| `OpenApiConfig`                                         | OpenAPI toggle, path, options                                                 |
| `OpenApiRouteMeta`                                      | Per-route OpenAPI metadata                                                    |
| `OpenApiSource`                                         | External OpenAPI spec source: `{ path: string }`                              |
| `ResolvedOpenApiSpec<TClaims, TLogScope>`               | Resolved spec with associated proxy route                                     |
| `Logger<TLogScope>`                                     | `{ debug, error, info, warn }` interface                                      |
| `ClaimExtractor<TClaims>`                               | Function to extract claims from a Hono Context                                |
| `RedisClient`                                           | Minimal Redis interface for distributed rate limiting                         |

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

## Logger Factories

```typescript
import { createDefaultLogger, createNoopLogger, createScopedLogger } from 'halide';

// Styled logger — colored in TTY, plain text otherwise
const logger = createDefaultLogger();

// Silent logger — all methods are no-ops
const silent = createNoopLogger();

// Wrap a logger with a fixed scope (used internally for per-request loggers)
const scoped = createScopedLogger(logger, { requestId: 'abc123' });
```
