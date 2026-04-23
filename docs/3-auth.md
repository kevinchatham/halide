# Authentication & authorization

## Authentication

Verify JWTs using a shared secret or a remote key set. Auth is configured under `security.auth`. Halide supports two strategies:

**Bearer (shared secret)**

```ts
security: {
  auth: {
    strategy: 'bearer',
    secret: () => process.env.JWT_SECRET,
    audience: 'my-app',           // optional: validates the aud claim
  },
}
```

Uses `hono/jwt` with HS256 algorithm. The `secret` can be a sync or async function returning the signing key.

**JWKS (remote key set)**

```ts
security: {
  auth: {
    strategy: 'jwks',
    jwksUri: 'https://idp.example.com/.well-known/jwks.json',
    audience: 'my-app',
  },
}
```

Uses `hono/jwk` with RS256 algorithm. The JWKS is fetched from `jwksUri` at runtime.

The `audience` field is optional. When set, it validates the `aud` claim in the JWT payload. The `aud` claim can be a string or an array of strings.

Failed authentication returns `401 Unauthorized` with `{ error: 'Unauthorized' }`.

Routes with `access: 'private'` require a valid JWT. If any private route exists, `security.auth` must be configured; the server will refuse to start otherwise.

## Authorization

Restrict route access with per-route logic beyond public/private. Every route accepts an optional `authorize` function for fine-grained access control:

```ts
{
  type: 'api',
  path: '/admin/settings',
  access: 'private',
  authorize: (ctx, claims, logger) => claims.role === 'admin',
  handler: async (ctx, claims, logger) => ({ settings: '...' }),
}
```

The `authorize` function receives `(ctx, claims, logger)` and returns `boolean | Promise<boolean>`. Unauthorized requests receive a `403 Forbidden` response.
