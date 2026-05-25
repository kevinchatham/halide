# API reference

## Functions

### `defineHalide<TApp = HalideContext>(): HalideBuilder<TApp>`

Builder factory that takes a single type parameter — a {@link HalideContext} type — and pre-bakes its claims and log scope types so callers only specify body types per route. Returns an object with `apiRoute`, `proxyRoute`, `createApp`, and `createServer`. Access `createApp` and `createServer` via the returned builder, not via direct import.

```ts
type App = HalideContext<UserClaims, LogScope>;
const { apiRoute, createServer } = defineHalide<App>();
```

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

### `disposeRateLimit(): void`

Cleans up the in-memory rate limit store and its internal dispose timer.

### `createTestApp(config, options?): HonoApp`

Creates a Hono app with routes registered for testing. Accepts `config` and optional `options` with flags for `cors`, `csp`, `rateLimit`, `requestId`, `errorHandler`, `appHandler`, and `logger`.

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

| Type                                                    | Description                                                                                                                                                                              |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ServerConfig<TClaims, TLogScope>`                      | Top-level configuration object with `apiRoutes`, `proxyRoutes`, `security`, `app`, `observability`, `openapi`                                                                            |
| `Server`                                                | Running server instance (`ready`, `start`, `stop`)                                                                                                                                       |
| `CreateAppResult`                                       | Return type of `createApp()` — `{ app, logger, proxyDispose, rateLimitDispose }`                                                                                                         |
| `ApiRoute<TClaims, TLogScope, TBody, TResponse>`        | API route definition with `access`, `method`, `path`, `handler`, `requestSchema`, `responseSchema`, `openapi`                                                                            |
| `ApiRouteHandler<TClaims, TLogScope, TBody, TResponse>` | `(ctx: RequestContext & { body: TBody }, app: HalideContext<TClaims, TLogScope>) => Promise<TResponse \| Response>`                                                                      |
| `ApiRouteInput<TClaims, TLogScope, TBody, TResponse>`   | Input type for `apiRoute()` factory — omits `type`; requires `handler`                                                                                                                   |
| `ProxyRoute<TClaims, TLogScope>`                        | Proxy route definition with `access`, `methods`, `path`, `target`, `proxyPath`, `identity`, `transform`, `openapi`, `openapiSpec`, `forwardHeaders`, `trustedProxies`, `connection`      |
| `ProxyRouteInput<TClaims, TLogScope>`                   | Input type for `proxyRoute()` factory — omits `type`                                                                                                                                     |
| `AuthorizeFn<TClaims, TLogScope>`                       | `(ctx: RequestContext, app: HalideContext<TClaims, TLogScope>) => boolean \| Promise<boolean>`                                                                                           |
| `TransformFn`                                           | `({ method, body, headers }) => { body, headers }` — transforms request body/headers before forwarding                                                                                   |
| `RequestContext`                                        | Normalized request context (`method`, `path`, `headers`, `params`, `query`, `body`)                                                                                                      |
| `ResponseContext`                                       | `{ statusCode, durationMs, error?, body?, bodyType? }` — response context passed to `onResponse` hook                                                                                    |
| `HalideContext<TClaims, TLogScope>`                     | `{ claims: TClaims \| undefined, logger: Logger<TLogScope> }` — bundled app context passed to handlers                                                                                   |
| `Logger<TLogScope>`                                     | `{ debug(scope, ...args), error(scope, ...args), info(scope, ...args), warn(scope, ...args) }` — structured logging interface, each method accepts a scope and variadic `unknown[]` args |
| `SecurityConfig`                                        | `{ auth?, cors?, csp?, rateLimit? }` — security configuration                                                                                                                            |
| `SecurityAuthConfig`                                    | `{ strategy?, secret?, jwksUri?, audience?, secretTtl?, algorithms? }` — auth strategy config                                                                                            |
| `CorsConfig`                                            | `{ origin?, methods?, credentials?, allowedHeaders?, exposedHeaders?, maxAge? }` — CORS configuration. Methods supports `'head'` and `'options'` in addition to the default 5            |
| `CspDirectives`                                         | Content Security Policy directives map with camelCase keys (e.g., `defaultSrc`, `scriptSrc`)                                                                                             |
| `CspDirectiveValue`                                     | `string \| ContentSecurityPolicyOptionHandler` — value for a CSP directive. `ContentSecurityPolicyOptionHandler` is an external type from `hono/secure-headers`                          |
| `AppConfig`                                             | `{ apiPrefix?, fallback?, name?, port?, root? }` — static file serving and port configuration                                                                                            |
| `ObservabilityConfig<TClaims, TLogScope>`               | `{ requestId?, logger?, logScopeFactory?, maxCollect?, formatMessage?, onRequest?, onResponse? }` — observability config                                                                 |
| `OpenApiConfig`                                         | `{ enabled?, path?, options? }` — OpenAPI/Scalar UI configuration                                                                                                                        |
| `OpenApiOptions`                                        | `{ title?, version?, description?, servers? }` — OpenAPI specification options                                                                                                           |
| `OpenApiRouteMeta`                                      | Per-route OpenAPI metadata (`summary`, `description`, `tags`, `responses`)                                                                                                               |
| `OpenApiSource`                                         | `{ path: string }` — source of an OpenAPI spec (local file or URL)                                                                                                                       |
| `TestAppOptions`                                        | `{ cors?, csp?, rateLimit?, requestId?, errorHandler?, appHandler?, logger? }` — options for `createTestApp()`                                                                           |
| `ResolvedOpenApiSpec<TClaims, TLogScope>`               | `{ spec: Record<string, unknown>, route: ProxyRoute }` — resolved external spec                                                                                                          |
| `ClaimExtractor<TClaims>`                               | `(c: Context) => Promise<TClaims \| null>` — function to extract claims from a Hono Context                                                                                              |
