# API reference

## Functions

### `defineHalide<TClaims, TLogScope>(): HalideBuilder`

Builder factory that pre-bakes `TClaims` and `TLogScope` so callers only specify body types per route. Returns an object with `apiRoute`, `proxyRoute`, `createApp`, and `createServer`.

```ts
const { apiRoute, createServer } = defineHalide<UserClaims, LogScope>();
```

### `createServer<TClaims, TLogScope>(config): Server`

Creates a fully-configured Halide server with lifecycle management. The server is synchronous to create. Call `server.start()` to listen. Graceful shutdown is handled automatically on SIGINT/SIGTERM.

### `createApp<TClaims, TLogScope>(config): CreateAppResult`

Creates a configured Hono application with all middleware, routes, and handlers. Does not start an HTTP server. Returns `{ app, logger, proxyDispose, rateLimitDispose }`. Useful for testing or custom server setups.

### `apiRoute<TClaims, TLogScope, TBody, TResponse>(input): ApiRoute`

Factory (obtained via `defineHalide()`) that fills in `type: 'api'` and a default `authorize` function (accepts any valid JWT). The input omits `type` and requires `handler`.

### `proxyRoute<TClaims, TLogScope>(input): ProxyRoute`

Factory (obtained via `defineHalide()`) that fills in `type: 'proxy'` and a default `authorize` function (accepts any valid JWT). The input omits `type`.

### `createDefaultLogger<TLogScope>(): Logger<TLogScope>`

Creates a styled logger with colored, level-prefixed messages. Uses `node:util.styleText` for colors in TTY, plain text otherwise.

### `createNoopLogger<TLogScope>(): Logger<TLogScope>`

Creates a logger that discards all log messages.

### `createScopedLogger<TLogScope>(logger, scope): Logger<TLogScope>`

Wraps a logger so every method automatically applies a fixed scope.

## Interfaces

### `Server`

| Property | Type                                         | Description                                                                                                                |
| -------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `ready`  | `Promise<void>`                              | Promise that resolves when the server is ready to accept connections                                                       |
| `start`  | `(onReady?: (port: number) => void) => void` | Starts listening. `onReady` callback invoked with port when ready. Port resolution: `PORT` env → `app.port` → default 3553 |
| `stop`   | `() => Promise<void>`                        | Gracefully shuts down the HTTP server and cleans up resources                                                              |

### `CreateAppResult`

| Property           | Type                        | Description                                                      |
| ------------------ | --------------------------- | ---------------------------------------------------------------- |
| `app`              | `HonoApp`                   | Hono app instance with all middleware and routes                 |
| `logger`           | `Logger<unknown>`           | Logger instance used throughout the server                       |
| `proxyDispose`     | `(() => void) \| undefined` | Cleanup function for proxy HTTP agent connections                |
| `rateLimitDispose` | `(() => void) \| undefined` | Cleanup function for rate limit timer (undefined if not enabled) |

## Exported types

| Type                                                    | Description                                                                                                                       |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `ServerConfig<TClaims, TLogScope>`                      | Top-level configuration object with `apiRoutes`, `proxyRoutes`, `security`, `app`, `observability`, `openapi`                     |
| `Server`                                                | Running server instance (`ready`, `start`, `stop`)                                                                                |
| `CreateAppResult`                                       | Return type of `createApp()` — `{ app, logger, proxyDispose, rateLimitDispose }`                                                  |
| `ApiRoute<TClaims, TLogScope, TBody, TResponse>`        | API route definition with `access`, `method`, `path`, `handler`, `requestSchema`, `responseSchema`, `openapi`                     |
| `ApiRouteHandler<TClaims, TLogScope, TBody, TResponse>` | `(ctx: RequestContext & { body: TBody }, app: HalideContext<TClaims, TLogScope>) => Promise<TResponse \| Response>`               |
| `ApiRouteInput<TClaims, TLogScope, TBody, TResponse>`   | Input type for `apiRoute()` factory — omits `type`; requires `handler`                                                            |
| `ProxyRoute<TClaims, TLogScope>`                        | Proxy route definition with `access`, `methods`, `path`, `target`, `proxyPath`, `identity`, `transform`, `openapi`, `openapiSpec` |
| `ProxyRouteInput<TClaims, TLogScope>`                   | Input type for `proxyRoute()` factory — omits `type`                                                                              |
| `AuthorizeFn<TClaims, TLogScope>`                       | `(ctx: RequestContext, app: HalideContext<TClaims, TLogScope>) => boolean \| Promise<boolean>`                                    |
| `TransformFn`                                           | `({ method, body, headers }) => { body, headers }` — transforms request body/headers before forwarding                            |
| `RequestContext`                                        | Normalized request context (`method`, `path`, `headers`, `params`, `query`, `body`)                                               |
| `ResponseContext`                                       | `{ statusCode, durationMs, error?, body?, bodyType? }` — response context passed to `onResponse` hook                             |
| `HalideContext<TClaims, TLogScope>`                     | `{ claims: TClaims \| undefined, logger: Logger<TLogScope> }` — bundled app context passed to handlers                            |
| `Logger<TLogScope>`                                     | `{ debug, error, info, warn }` interface for structured logging                                                                   |
| `SecurityConfig`                                        | `{ auth?, cors?, csp?, rateLimit? }` — security configuration                                                                     |
| `SecurityAuthConfig`                                    | `{ strategy?, secret?, jwksUri?, audience?, secretTtl?, algorithms? }` — auth strategy config                                     |
| `CorsConfig`                                            | `{ origin?, methods?, credentials?, allowedHeaders?, exposedHeaders?, maxAge? }` — CORS configuration                             |
| `CspDirectives`                                         | Content Security Policy directives map with camelCase keys (e.g., `defaultSrc`, `scriptSrc`)                                      |
| `CspDirectiveValue`                                     | `string \| ContentSecurityPolicyOptionHandler` — value for a CSP directive                                                        |
| `AppConfig`                                             | `{ apiPrefix?, fallback?, name?, port?, root? }` — static file serving and port configuration                                     |
| `ObservabilityConfig<TClaims, TLogScope>`               | `{ requestId?, logger?, logScopeFactory?, maxCollect?, onRequest?, onResponse? }` — observability config                          |
| `OpenApiConfig`                                         | `{ enabled?, path?, options? }` — OpenAPI/Scalar UI configuration                                                                 |
| `OpenApiOptions`                                        | `{ title?, version?, description?, servers? }` — OpenAPI specification options                                                    |
| `OpenApiRouteMeta`                                      | Per-route OpenAPI metadata (`summary`, `description`, `tags`, `responses`)                                                        |
| `OpenApiSource`                                         | `{ path: string }` — source of an OpenAPI spec (local file or URL)                                                                |
| `ResolvedOpenApiSpec<TClaims, TLogScope>`               | `{ spec: Record<string, unknown>, route: ProxyRoute }` — resolved external spec                                                   |
| `ClaimExtractor<TClaims>`                               | `(c: Context) => Promise<TClaims \| null>` — function to extract claims from a Hono Context                                       |
