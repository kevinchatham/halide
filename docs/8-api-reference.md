# API reference

### `createServer<TClaims>(config): Promise<Server>`

Creates and returns a Halide server. Validates the config before starting.

### `Server`

| Method    | Description                                                               |
| --------- | ------------------------------------------------------------------------- |
| `start()` | Starts listening. Port resolution: `PORT` env → `spa.port` → default 3553 |
| `stop()`  | Gracefully shuts down the HTTP server and cleans up resources             |

### `apiRoute<TClaims, TBody>(input): ApiRoute`

Factory that fills in `type: 'api'` and a default `authorize` function.

### `proxyRoute<TClaims>(input): ProxyRoute`

Factory that fills in `type: 'proxy'` and a default `authorize` function.

### Exported types

| Type                              | Description                                                             |
| --------------------------------- | ----------------------------------------------------------------------- |
| `ServerConfig<TClaims>`           | Top-level configuration object                                          |
| `Server`                          | Running server instance (`start`, `stop`)                               |
| `ApiRoute<TClaims, TBody>`        | API route definition                                                    |
| `ApiRouteInput<TClaims, TBody>`   | Input type for `apiRoute()` (excludes computed `type` field)            |
| `ApiRouteHandler<TClaims, TBody>` | `(ctx, claims, logger) => Promise<unknown>`                             |
| `ProxyRoute<TClaims>`             | Proxy route definition                                                  |
| `ProxyRouteInput<TClaims>`        | Input type for `proxyRoute()` (excludes computed `type` field)          |
| `Route<TClaims, TBody>`           | Union of `ApiRoute \| ProxyRoute`                                       |
| `AuthorizeFn<TClaims>`            | `(ctx, claims, logger) => boolean \| Promise<boolean>`                  |
| `TransformFn`                     | `({ body, headers }) => { body, headers }`                              |
| `RequestContext`                  | Normalized request context (method, path, headers, params, query, body) |
| `ResponseContext`                 | Response metadata (statusCode, durationMs, error?)                      |
| `SecurityConfig`                  | CORS, CSP, auth, rate limit configuration                               |
| `SecurityAuthConfig`              | Auth strategy, secret/JWKS, audience                                    |
| `CorsConfig`                      | Origin, methods, credentials, headers                                   |
| `CspOptions`                      | Content Security Policy directives                                      |
| `CspDirectives`                   | CSP directive map (keys are directive names)                            |
| `CspDirectiveValue`               | Single CSP directive value (string or function)                         |
| `SpaConfig`                       | Static file serving and port configuration                              |
| `ObservabilityConfig<TClaims>`    | Logger, request ID, lifecycle hooks                                     |
| `OpenApiConfig`                   | Swagger UI toggle, path, and options                                    |
| `OpenApiOptions`                  | OpenAPI document options (title, version, description, servers)         |
| `OpenApiRouteMeta`                | Per-route OpenAPI metadata (summary, tags, schemas)                     |
| `Logger`                          | `{ debug, error, info, warn }` interface                                |
