# Authentication & Authorization

## Configuration

Configure under `security.auth`. **Private routes require `security.auth` to be configured** — the validator will throw if any route has `access: 'private'` without auth config.

### Bearer (shared secret, HS256)

Uses `hono/jwt` internally with `verify()`.

```typescript
security: {
  auth: {
    strategy: 'bearer',
    secret: 'my-secret-key',              // sync string
    // secret: () => vaultClient.readSecret('jwt-signing-key'),  // sync or async function
    audience: 'my-app',
    secretTtl: 60,  // optional — TTL in seconds for caching the secret. Default: 60.
    algorithms: ['HS256'],  // optional — default: ['HS256']
  },
}
```

The `secret` field accepts a plain string or a sync/async function. The result is cached for `secretTtl` seconds (default: 60) to avoid repeated calls. Set `secretTtl: 0` to disable caching and resolve on every request.

Algorithms are tried sequentially; the first algorithm that produces a valid payload (and passes audience check) is accepted.

### JWKS (remote key set, RS256)

Uses `hono/jwk` internally. Fetches and caches public keys from the JWKS endpoint.

```typescript
security: {
  auth: {
    strategy: 'jwks',
    jwksUri: 'https://idp.example.com/.well-known/jwks.json',
    audience: 'my-app',  // optional
    algorithms: ['RS256'],  // optional — default: ['RS256']
  },
}
```

**JWKS caching:** Keys are cached for 1 hour (3600000ms) per unique JWKS URI. Maximum 100 cached entries (FIFO eviction). Background refresh runs at half-TTL (30 min) to proactively update soon-to-expire entries. Concurrent fetches for the same URI are deduplicated.

## How Auth Works

- JWTs are extracted from the `Authorization: Bearer <token>` header
- For bearer: token is verified with `hono/jwt` `verify()` using configurable algorithms
- For JWKS: token is verified with `hono/jwk` middleware using RS256
- If audience is specified, the `aud` claim is validated (supports string or array per JWT spec)
- Failed auth returns `401 Unauthorized` with `{ error: 'Unauthorized' }`
- Public routes skip auth entirely — `app.claims` will be `undefined` in handlers

## Authorization Functions

Beyond the `access: 'public' | 'private'` toggle, every route accepts an optional `authorize` function for fine-grained access control:

```typescript
apiRoute({
  access: 'private',
  path: '/admin/settings',
  authorize: (ctx, app) => app.claims?.role === 'admin',
  handler: async () => ({ settings: '...' }),
});
```

The `authorize` function receives `(ctx: RequestContext, app: HalideContext)` and returns `boolean | Promise<boolean>`. Failed authorization returns `403 Forbidden` with `{ error: 'Forbidden' }`.

The `apiRoute()` and `proxyRoute()` factories fill in a default `authorize` that always returns `true`.

## Claims

- `app.claims` is populated only for private routes with successful auth
- For public routes, `app.claims` will be `undefined` in handlers
- Type claims via `HalideContext<TClaims, TLogScope>` — e.g., `type App = HalideContext<UserClaims, LogScope>`

## Claim Extractor

```typescript
type ClaimExtractor<TClaims = unknown> = (c: Context) => Promise<TClaims | null>;
```

The `ClaimExtractor` type is exported but the extractor function itself is internal. The framework creates claim extractors from auth config and handles both bearer and JWKS strategies with secret caching. Extractors are cached by auth strategy key (FIFO eviction when cache exceeds limit).
