# API reference

## Functions

### `createServer<TClaims>(config): Server`

Creates and returns a Halide server. Validates the config before starting. Synchronous — no `await` needed.

### `createApp<TClaims>(config): CreateAppResult`

Creates a Hono app instance without starting an HTTP server. Returns `{ app, rateLimitDispose }`. Useful for testing or custom server setups. Synchronous — no `await` needed.

### `apiRoute<TClaims, TBody>(input): ApiRoute`

Factory that fills in `type: 'api'` and a default `authorize` function (always returns `true`).

### `proxyRoute<TClaims>(input): ProxyRoute`

Factory that fills in `type: 'proxy'` and a default `authorize` function (always returns `true`).

### `inferSchema<TRequest, TResponse>(request?, response?): InferSchemaResult`

Helper that eliminates duplication between `validationSchema` and `openapi` schemas. When a request schema is provided, it sets both `validationSchema` and `openapi.requestSchema`. When a response schema is provided, it sets `openapi.responseSchema`. Spread the result into an `apiRoute` call:

```ts
apiRoute({
  access: 'public',
  path: '/users',
  method: 'post',
  ...inferSchema(CreateUserSchema, UserResponseSchema),
  handler: async (ctx) => createUser(ctx.body),
});
```

## Interfaces

### `Server`

| Property         | Description                                                                                                                        |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `ready`          | `Promise<void>` that resolves when the server is listening                                                                         |
| `start(onReady)` | Starts listening. `onReady?: (port: number) => void` is called when ready. Port resolution: `PORT` env → `spa.port` → default 3553 |
| `stop()`         | Gracefully shuts down the HTTP server and cleans up resources                                                                      |

### `CreateAppResult`

| Property           | Type                        | Description                                                                    |
| ------------------ | --------------------------- | ------------------------------------------------------------------------------ |
| `app`              | `Hono`                      | Hono app instance with all middleware and routes                               |
| `rateLimitDispose` | `(() => void) \| undefined` | Cleanup function for rate limit timer (undefined if rate limiting not enabled) |

## Exported types

| Type                              | Description                                                             |
| --------------------------------- | ----------------------------------------------------------------------- |
| `ServerConfig<TClaims>`           | Top-level configuration object                                          |
| `Server`                          | Running server instance (`ready`, `start`, `stop`)                      |
| `CreateAppResult`                 | Return type of `createApp()` — `{ app, rateLimitDispose }`              |
| `ApiRoute<TClaims, TBody>`        | API route definition                                                    |
| `ApiRouteHandler<TClaims, TBody>` | `(ctx, claims, logger) => Promise<unknown>`                             |
| `ProxyRoute<TClaims>`             | Proxy route definition                                                  |
| `AuthorizeFn<TClaims>`            | `(ctx, claims, logger) => boolean \| Promise<boolean>`                  |
| `TransformFn`                     | `({ body, headers }) => { body, headers }`                              |
| `RequestContext`                  | Normalized request context (method, path, headers, params, query, body) |
| `SecurityConfig`                  | CORS, CSP, auth, rate limit configuration                               |
| `SecurityAuthConfig`              | Auth strategy, secret/JWKS, audience, secretTtl                         |
| `CorsConfig`                      | Origin, methods, credentials, allowedHeaders, exposedHeaders, maxAge    |
| `CspOptions`                      | Content Security Policy directives container                            |
| `CspDirectives`                   | CSP directive map (camelCase keys)                                      |
| `SpaConfig`                       | Static file serving and port configuration                              |
| `ObservabilityConfig<TClaims>`    | Logger, request ID, lifecycle hooks                                     |
| `OpenApiConfig`                   | OpenAPI toggle, path, and options                                       |
| `OpenApiRouteMeta`                | Per-route OpenAPI metadata (summary, tags, schemas)                     |
| `Logger`                          | `{ debug, error, info, warn }` interface                                |
| `ClaimExtractor<TClaims>`         | Function to extract claims from a Hono Context                          |

## Not exported but referenced

| Type              | Description                                                                    |
| ----------------- | ------------------------------------------------------------------------------ |
| `ResponseContext` | `{ statusCode, durationMs, error? }` — used by `onResponse` hook arg           |
| `OpenApiOptions`  | `{ title, version, description, servers }` — nested in `OpenApiConfig.options` |
