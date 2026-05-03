# Authentication & Authorization

## Configuration

Configure under `security.auth`. **Private routes require `security.auth` to be configured** — the validator will throw if any route has `access: 'private'` without auth config.

### Bearer (shared secret, HS256)

Uses `hono/jwt` internally.

```typescript
security: {
  auth: {
    strategy: 'bearer',
    secret: () => vaultClient.readSecret('jwt-signing-key'), // async function
    audience: 'my-app',
    secretTtl: 60, // optional — TTL in seconds for caching the secret. Default: 60. Set to 0 to disable caching.
  },
}
```

The `secret` field accepts a sync or async function. The result is cached for `secretTtl` seconds (default: 60) to avoid repeated calls. Set `secretTtl: 0` to disable caching and resolve on every request. `secretTtl` must be a non-negative integer (validator throws otherwise).

### JWKS (remote key set, RS256)

Uses `hono/jwk` internally.

```typescript
security: {
  auth: {
    strategy: 'jwks',
    jwksUri: 'https://idp.example.com/.well-known/jwks.json',
    audience: 'my-app',    // optional
  },
}
```

## How Auth Works

- JWTs are extracted from the `Authorization: Bearer <token>` header
- For bearer: token is verified with `hono/jwt` `verify()` using HS256
- For JWKS: token is verified with `hono/jwk` middleware using RS256
- If audience is specified, the `aud` claim is validated (supports string or array)
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

The `authorize` function receives `(ctx, app)` and returns `boolean | Promise<boolean>`. Failed authorization returns `403 Forbidden` with `{ error: 'Forbidden' }`.

The `apiRoute()` and `proxyRoute()` factories fill in a default `authorize` that always returns `true`.

## Claims

- `app.claims` is populated only for private routes with successful auth
- For public routes, `app.claims` will be `undefined` in handlers
- Type claims via `THalideApp<TClaims>` — e.g., `type App = THalideApp<UserClaims>`
