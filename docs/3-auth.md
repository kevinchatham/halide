# Authentication & authorization

## Authentication

Verify JWTs using a shared secret or a remote key set. Auth is configured under `security.auth`. Halide supports two strategies:

**Bearer (shared secret, HS256)**

```ts
security: {
  auth: {
    strategy: 'bearer',
    secret: () => process.env.JWT_SECRET,
    audience: 'my-app',           // optional: validates the aud claim
    secretTtl: 60,                // optional: cache secret for N seconds (default: 60)
  },
}
```

Uses `hono/jwt` with HS256 algorithm. The `secret` can be a sync or async function returning the signing key. The resolved secret is cached for `secretTtl` seconds (default: 60) to avoid repeated calls. Set `secretTtl: 0` to disable caching and resolve on every request.

**JWKS (remote key set, RS256)**

```ts
security: {
  auth: {
    strategy: 'jwks',
    jwksUri: 'https://idp.example.com/.well-known/jwks.json',
    audience: 'my-app',           // optional
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
import { apiRoute } from 'halide';

apiRoute({
  access: 'private',
  path: '/admin/settings',
  authorize: (ctx, app) => app.claims?.role === 'admin',
  handler: async (ctx, app) => ({ settings: '...' }),
});
```

The `authorize` function receives `(ctx: RequestContext, app: TApp)` where `app` is a `THalideApp` containing `claims` and `logger`. Returns `boolean | Promise<boolean>`. Unauthorized requests receive a `403 Forbidden` response with `{ error: 'Forbidden' }`.

The `apiRoute()` and `proxyRoute()` factories fill in a default `authorize` that always returns `true`.
