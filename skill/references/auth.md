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

Uses `hono/jwk` internally with cached middleware instances. Cache is evicted on TTL expiration (10-minute sweep interval). Background refresh happens at half-TTL.

```typescript
security: {
  auth: {
    strategy: 'jwks',
    jwksUri: 'https://idp.example.com/.well-known/jwks.json',
    audience: 'my-app',  // optional
  },
}
```

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
- Type claims via `HalideContext<TClaims>` — e.g., `type App = HalideContext<UserClaims>`

## Claim Extractor

```typescript
type ClaimExtractor<TClaims = unknown> = (c: Context) => Promise<TClaims | null>;
```

The claim extractor is created from config (`createClaimExtractor`) and handles both bearer and JWKS strategies with secret caching. Extractors are cached by auth strategy key (FIFO eviction when cache exceeds limit).
