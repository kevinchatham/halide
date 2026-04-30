# Routes — API and Proxy

## API Routes

Created with `apiRoute()`. These are handler functions that compose and return data directly.

```typescript
apiRoute({
  access: 'public' | 'private',    // REQUIRED
  path: '/api/health',             // REQUIRED — must start with /
  method: 'get',                   // default: 'get'
  handler: async (ctx, claims, logger) => ({ status: 'ok' }),  // REQUIRED
  requestSchema: MyZodSchema,   // optional — Zod schema for body validation
  authorize: (ctx, claims, logger) => true,  // auto-filled by factory
  observe: true,                   // optional — set false to skip observability hooks
  openapi: { ... },                // optional — OpenAPI metadata
})
```

### Handler Signature

```typescript
handler: (ctx: RequestContext & { body: TBody }, claims: TClaims | undefined, logger: Logger) =>
  Promise<unknown>;
```

- `ctx` is a **plain object** (NOT a Hono Context) with `{ method, path, headers, params, query, body }`
- `claims` is populated only for private routes with successful auth
- `logger` is the configured Logger (defaults to no-op if omitted)
- Return value is automatically JSON-serialized via `c.json(result)`

### Body Validation

Attach a Zod schema with `requestSchema`. The body is parsed and validated before the handler runs. Failed validation returns `400 Bad Request`.

```typescript
import { z } from 'zod';

const CreateUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
});

apiRoute({
  access: 'private',
  path: '/users',
  method: 'post',
  requestSchema: CreateUserSchema,
  handler: async (ctx) => createUser(ctx.body),
});
```

For routes without `requestSchema`, the body is parsed from JSON for POST/PUT/PATCH requests (returns `undefined` if parsing fails).

### Supported Methods

`'get'`, `'post'`, `'put'`, `'patch'`, `'delete'` — defaults to `'get'`.

## Proxy Routes

Created with `proxyRoute()`. These forward requests to backend services.

```typescript
proxyRoute({
  access: 'public' | 'private',    // REQUIRED
  path: '/api/products',           // REQUIRED — must start with /
  methods: ['get', 'post'],        // REQUIRED — array of HTTP methods
  target: 'http://products.internal',  // REQUIRED
  proxyPath: '/products',          // optional — rewrites path prefix (defaults to path)
  timeout: 5000,                   // optional — ms, default: 60000
  identity: (ctx, claims) => ({ 'x-user-id': claims.sub }),  // optional
  transform: ({ method, body, headers }) => ({ body, headers }), // optional
  authorize: (ctx, claims, logger) => true,  // auto-filled by factory
  observe: true,                   // optional
  openapi: { ... },                // optional
})
```

### Path Rewriting

The `path` is the incoming route prefix. The `proxyPath` (defaults to `path` if omitted) is the prefix on the target. The incoming path prefix is replaced with `proxyPath`:

```
Incoming: /api/products/123
path:     /api/products
proxyPath: /products
Result:   http://products.internal/products/123
```

Query parameters and the remainder of the path are forwarded as-is.

**Wildcard paths:** The `path` can end with `/*` to match all sub-paths. When using wildcards, the `proxyPath` can also use `/*` to preserve the matched suffix:

```
Incoming: /api/users/123
path:     /api/*
proxyPath: /backend/*
Result:   http://products.internal/backend/users/123
```

If `proxyPath` is a plain path (no wildcard), the suffix is still appended:

```
Incoming: /api/users/123
path:     /api/*
proxyPath: /backend
Result:   http://products.internal/backend/users/123
```

### Host Header Behavior

The original `Host` header from the client request is **NOT** forwarded to the backend. Instead, the `host` header is derived from the target URL, which is the correct behavior for most backend services and CDNs. The original host value is preserved as `X-Forwarded-Host` for backend reference.

This prevents routing issues with CDNs (like Akamai) that use the `host` header to route requests — forwarding the client's host header to the backend would cause 404 errors.

### Identity Headers

The `identity` function receives `(ctx, claims)` and returns a `Record<string, string>` of headers to inject into the proxied request. Only called when `claims` is defined (i.e., private routes with successful auth).

```typescript
identity: (ctx, claims) => ({
  'x-user-id': claims.sub,
  'x-user-role': claims.role,
});
```

### Transform

The `transform` function receives `{ method, body, headers }` and returns `{ body, headers }` to modify the request before proxying. `method` is the lowercase HTTP method. The body is JSON-stringified. Headers are normalized to lowercase keys.

```typescript
transform: ({ method, body, headers }) => ({
  body: { ...body, source: 'halide' },
  headers: { ...headers, 'x-proxy': 'true' },
});
```

If no transform is provided, the raw request body is forwarded as-is.

### Host Header Behavior

The original `Host` header from the client request is **NOT** forwarded to the backend. Instead, the `host` header is derived from the target URL, which is the correct behavior for most backend services and CDNs. The original host value is preserved as `X-Forwarded-Host` for backend reference.

This prevents routing issues with CDNs (like Akamai) that use the `host` header to route requests — forwarding the client's host header to the backend would cause 404 errors.

The following headers are stripped from proxied requests and cannot be overridden by `identity` or `transform`:

- `host`
- `connection`
- `content-length`
- `transfer-encoding`
- `set-cookie` (multi-value, not writable)

### Timeout

Defaults to **60,000ms** (60 seconds). Uses `AbortSignal.timeout()`.
