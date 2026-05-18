# Authentication & authorization

## Authentication

Verify JWTs using a shared secret or a remote key set. Auth is configured under `security.auth`. Halide supports two strategies:

The `strategy` field defaults to `'bearer'` when omitted.

**Bearer (shared secret)**

```ts
security: {
  auth: {
    strategy: 'bearer',
    secret: process.env.JWT_SECRET ?? 'dev-secret',
    audience: 'my-app',           // optional: validates the aud claim
    secretTtl: 60,                // optional: cache secret for N seconds (default: 60)
    algorithms: ['HS256'],        // optional: allowed algorithms (default: ['HS256'])
  },
}
```

Uses `hono/jwt`. The `secret` can be a sync or async function returning the signing key. The resolved secret is cached for `secretTtl` seconds (default: 60) to avoid repeated calls. Set `secretTtl: 0` to disable caching and resolve on every request.

The `algorithms` field controls which JWT signing algorithms are accepted. Defaults to `['HS256']`. Bearer strategy supports symmetric algorithms (HS256, HS384, HS512) and asymmetric algorithms (RS256, RS384, RS512, ES256, ES384, ES512, PS256, PS384, PS512, EdDSA) when the secret matches the algorithm.

**JWKS (remote key set)**

```ts
security: {
  auth: {
    strategy: 'jwks',
    jwksUri: 'https://idp.example.com/.well-known/jwks.json',
    audience: 'my-app',           // optional
    algorithms: ['RS256'],        // optional: allowed algorithms (default: ['RS256'])
  },
}
```

Uses `hono/jwk`. The JWKS is fetched from `jwksUri` at runtime and cached with a 1-hour TTL. When a cached entry expires, concurrent requests are deduplicated via fetch locks to avoid redundant network calls. A background refresh timer proactively re-fetches keys when they're within half their TTL of expiration.

The `algorithms` field controls which signing algorithms are accepted. Defaults to `['RS256']`. JWKS strategy supports asymmetric algorithms: RS256, RS384, RS512, PS256, PS384, PS512, ES256, ES384, ES512, and EdDSA.

The `audience` field is optional. When set, it validates the `aud` claim in the JWT payload. The `aud` claim can be a string or an array of strings.

Failed authentication returns `401 Unauthorized` with `{ error: 'Unauthorized' }`.

Routes with `access: 'private'` require a valid JWT. If any private route exists, `security.auth` must be configured; the server will refuse to start otherwise.

## Authorization

Restrict route access with per-route logic beyond public/private. Every route accepts an optional `authorize` function for fine-grained access control:

```ts
import { defineHalide } from 'halide';

const { apiRoute } = defineHalide();

apiRoute({
  access: 'private',
  path: '/admin/settings',
  authorize: (ctx, app) => app.claims?.role === 'admin',
  handler: async (ctx, app) => {
    app.logger.info({ user: app.claims?.sub }, 'Admin settings accessed');
    return { settings: '...' };
  },
});
```

The `authorize` function receives `(ctx: RequestContext, app: HalideContext<TClaims, TLogScope>)` where `app` contains `claims` and `logger`. Returns `boolean | Promise<boolean>`. Unauthorized requests receive a `403 Forbidden` response with `{ error: 'Forbidden' }`.

The `apiRoute()` and `proxyRoute()` factories fill in a default `authorize` that always returns `true`.
