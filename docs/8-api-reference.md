# API reference

## Functions

### `createServer<TApp>(config): Server`

Creates and returns a Halide server. Validates the config before starting. Synchronous — no `await` needed.

### `createApp<TApp>(config): CreateAppResult`

Creates a Hono app instance without starting an HTTP server. Returns `{ app, rateLimitDispose }`. Useful for testing or custom server setups. Synchronous — no `await` needed.

### `apiRoute<TApp, TBody, TResponse>(input): ApiRoute`

Factory that fills in `type: 'api'` and a default `authorize` function (always returns `true`).

### `proxyRoute<TApp>(input): ProxyRoute`

Factory that fills in `type: 'proxy'` and a default `authorize` function (always returns `true`).

## Interfaces

### `Server`

| Property         | Description                                                                                                                        |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `ready`          | `Promise<void>` that resolves when the server is listening                                                                         |
| `start(onReady)` | Starts listening. `onReady?: (port: number) => void` is called when ready. Port resolution: `PORT` env → `app.port` → default 3553 |
| `stop()`         | Gracefully shuts down the HTTP server and cleans up resources                                                                      |

### `CreateAppResult`

| Property           | Type                        | Description                                                                    |
| ------------------ | --------------------------- | ------------------------------------------------------------------------------ |
| `app`              | `Hono`                      | Hono app instance with all middleware and routes                               |
| `rateLimitDispose` | `(() => void) \| undefined` | Cleanup function for rate limit timer (undefined if rate limiting not enabled) |

## Exported types

| Type                                      | Description                                                                                            |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `ServerConfig<TApp>`                      | Top-level configuration object                                                                         |
| `Server`                                  | Running server instance (`ready`, `start`, `stop`)                                                     |
| `CreateAppResult`                         | Return type of `createApp()` — `{ app, rateLimitDispose }`                                             |
| `ApiRoute<TApp, TBody, TResponse>`        | API route definition                                                                                   |
| `ApiRouteHandler<TApp, TBody, TResponse>` | `(ctx: RequestContext & { body: TBody }, app: TApp) => Promise<TResponse>`                             |
| `ProxyRoute<TApp>`                        | Proxy route definition                                                                                 |
| `AuthorizeFn<TApp>`                       | `(ctx: RequestContext, app: TApp) => boolean \| Promise<boolean>`                                      |
| `TransformFn`                             | `({ method, body, headers }) => { body, headers }`                                                     |
| `RequestContext`                          | Normalized request context (method, path, headers, params, query, body)                                |
| `ApiRouteInput<TApp, TBody, TResponse>`   | Input type for `apiRoute()` factory — omits `type`; requires `handler`                                 |
| `ProxyRouteInput<TApp>`                   | Input type for `proxyRoute()` factory — omits `type`                                                   |
| `SecurityConfig`                          | CORS, CSP, auth, rate limit configuration                                                              |
| `SecurityAuthConfig`                      | Auth strategy, secret/JWKS, audience, secretTtl                                                        |
| `CorsConfig`                              | Origin, methods, credentials, allowedHeaders, exposedHeaders, maxAge                                   |
| `CspOptions`                              | Content Security Policy directives container                                                           |
| `CspDirectives`                           | CSP directive map (camelCase keys)                                                                     |
| `CspDirectiveValue`                       | `string \| ContentSecurityPolicyOptionHandler` — value for a CSP directive                             |
| `AppConfig`                               | Static file serving and port configuration                                                             |
| `THalideApp<TClaims, TLogScope>`          | `{ claims: TClaims \| undefined, logger: Logger<TLogScope> }` — bundled app context passed to handlers |
| `ObservabilityConfig<TApp>`               | Logger, request ID, lifecycle hooks                                                                    |
| `OpenApiConfig`                           | OpenAPI toggle, path, and options                                                                      |
| `OpenApiRouteMeta`                        | Per-route OpenAPI metadata (summary, tags, responses)                                                  |
| `OpenApiSource`                           | `{ path: string }` — source of an OpenAPI spec (local file or URL)                                     |
| `ResolvedOpenApiSpec`                     | `{ spec: Record<string, unknown>, route: ProxyRoute }` — resolved external spec                        |
| `Logger`                                  | `{ debug, error, info, warn }` interface                                                               |
| `ClaimExtractor<TClaims>`                 | `(c: Context) => Promise<TClaims \| null>` — function to extract claims from a Hono Context            |
| `ResponseContext`                         | `{ statusCode, durationMs, error?, body? }` — response context passed to `onResponse` hook             |
| `OpenApiOptions`                          | `{ title?, version?, description?, servers? }` — OpenAPI specification options                         |
