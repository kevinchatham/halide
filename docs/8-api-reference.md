# API reference

### `createServer<TClaims>(config): Server`

Creates and returns a Halide server. Validates the config before starting. Synchronous — no `await` needed.

### `createApp<TClaims>(config): CreateAppResult`

Creates a Hono app instance without starting an HTTP server. Returns `{ app, rateLimitDispose }`. Useful for testing or custom server setups. Synchronous — no `await` needed.

### `Server`

| Property         | Description                                                                                                                        |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `ready`          | `Promise<void>` that resolves when the server is listening                                                                         |
| `start(onReady)` | Starts listening. `onReady?: (port: number) => void` is called when ready. Port resolution: `PORT` env → `spa.port` → default 3553 |
| `stop()`         | Gracefully shuts down the HTTP server and cleans up resources                                                                      |

### `apiRoute<TClaims, TBody>(input): ApiRoute`

Factory that fills in `type: 'api'` and a default `authorize` function.

### `proxyRoute<TClaims>(input): ProxyRoute`

Factory that fills in `type: 'proxy'` and a default `authorize` function.

### Exported types

| Type                              | Description                                                             |
| --------------------------------- | ----------------------------------------------------------------------- |
| `ServerConfig<TClaims>`           | Top-level configuration object                                          |
| `Server`                          | Running server instance (`start`, `stop`)                               |
| `CreateAppResult`                 | Return type of `createApp()` — `{ app, rateLimitDispose }`              |
| `ApiRoute<TClaims, TBody>`        | API route definition                                                    |
| `ApiRouteHandler<TClaims, TBody>` | `(ctx, claims, logger) => Promise<unknown>`                             |
| `ProxyRoute<TClaims>`             | Proxy route definition                                                  |
| `AuthorizeFn<TClaims>`            | `(ctx, claims, logger) => boolean \| Promise<boolean>`                  |
| `TransformFn`                     | `({ body, headers }) => { body, headers }`                              |
| `RequestContext`                  | Normalized request context (method, path, headers, params, query, body) |
| `SecurityConfig`                  | CORS, CSP, auth, rate limit configuration                               |
| `SecurityAuthConfig`              | Auth strategy, secret/JWKS, audience                                    |
| `CorsConfig`                      | Origin, methods, credentials, headers                                   |
| `CspOptions`                      | Content Security Policy directives                                      |
| `CspDirectives`                   | CSP directive map (keys are directive names)                            |
| `SpaConfig`                       | Static file serving and port configuration                              |
| `ObservabilityConfig<TClaims>`    | Logger, request ID, lifecycle hooks                                     |
| `OpenApiConfig`                   | OpenAPI toggle, path, and options                                       |
| `OpenApiRouteMeta`                | Per-route OpenAPI metadata (summary, tags, schemas)                     |
| `Logger`                          | `{ debug, error, info, warn }` interface                                |
| `ClaimExtractor<TClaims>`         | Function to extract claims from a Hono Context                          |
