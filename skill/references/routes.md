# Routes — API and Proxy

## API Routes

Created with `apiRoute()`. These are handler functions that compose and return data directly.

```typescript
type App = HalideContext<UserClaims>;

apiRoute({
  access: 'public' | 'private',    // REQUIRED
  path: '/api/health',             // REQUIRED — must start with /
  method: 'get',                   // default: 'get'
  handler: async (ctx, app) => ({ status: 'ok' }),  // REQUIRED
  requestSchema: MyZodSchema,   // optional — Zod schema for body validation
  authorize: (ctx, app) => true,  // auto-filled by factory
  observe: true,                   // optional — set false to skip observability hooks
  openapi: { ... },                // optional — OpenAPI metadata
})
```

### Handler Signature

```typescript
handler: (ctx: RequestContext & { body: TBody }, app: HalideContext) =>
  Promise<TResponse | Response>;
```

- `ctx` is a **plain object** (NOT a Hono Context) with `{ method, path, headers, params, query, body }`
- `app` is a `HalideContext` containing `claims` and `logger`
- `app.claims` is populated only for private routes with successful auth
- Return value is automatically JSON-serialized via `c.json(result)` unless you return a `Response` directly

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
  handler: async (ctx, app) => createUser(ctx.body),
});
```

For routes without `requestSchema`, the body is parsed from JSON for POST/PUT/PATCH requests (returns `undefined` if parsing fails).

### Supported Methods

`'get'`, `'post'`, `'put'`, `'patch'`, `'delete'` — defaults to `'get'`.

## Proxy Routes

Created with `proxyRoute()`. These forward requests to backend services.

```typescript
type App = HalideContext<UserClaims>;

proxyRoute({
  access: 'public' | 'private',    // REQUIRED
  path: '/api/products',           // REQUIRED — must start with /
  methods: ['get', 'post'],        // REQUIRED — array of HTTP methods
  target: 'http://products.internal',  // REQUIRED
  proxyPath: '/products',          // optional — rewrites path prefix (defaults to path)
  timeout: 10000,                  // optional — ms, default: 10000
  identity: (ctx, app) => ({ 'x-user-id': app.claims?.sub }),  // optional
  transform: ({ method, body, headers }) => ({ body, headers }), // optional
  forwardHeaders: ['accept', 'content-type'],  // optional — headers to forward (default: safe subset)
  authorize: (ctx, app) => true,  // auto-filled by factory
  observe: true,                   // optional
  openapi: { ... },                // optional
  openapiSpec: { path: '/openapi.json' },  // optional — external spec source
  agent?: http.Agent,              // optional — custom HTTP agent
  connection?: {                   // optional — connection pool settings (when agent not set)
    maxSockets?: number;           // default: 50
    maxFreeSockets?: number;       // default: 10
  },
  trustedProxies?: string[],       // optional — trust x-forwarded-for from these IPs/CIDRs
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

### Identity Headers

The `identity` function receives `(ctx, app)` and returns a `Record<string, string>` of headers to inject into the proxied request. Only called when `app.claims` is defined (i.e., private routes with successful auth). Read-only headers (`host`, `connection`, `content-length`, `transfer-encoding`) and multi-value headers (`set-cookie`) cannot be overridden.

```typescript
identity: (ctx, app) => ({
  'x-user-id': app.claims?.sub,
  'x-user-role': app.claims?.role,
});
```

### Transform

The `transform` function receives `{ method, body, headers }` and returns `{ body, headers }` to modify the request before proxying. `method` is the lowercase HTTP method. The body is JSON-stringified. Headers are normalized to lowercase keys. Read-only headers cannot be modified by transform.

```typescript
transform: ({ method, body, headers }) => ({
  body: { ...body, source: 'halide' },
  headers: { ...headers, 'x-proxy': 'true' },
});
```

If no transform is provided, the raw request body is forwarded as-is.

### Forward Headers

Controls which request headers are forwarded to upstream. Defaults to: `accept`, `accept-encoding`, `accept-language`, `cache-control`, `content-type`, `origin`, `user-agent`. Set to an empty array `[]` to forward no headers. Headers are matched case-insensitively.

`x-forwarded-for` is only forwarded when `trustedProxies` is configured AND the socket IP matches a trusted proxy.

```typescript
forwardHeaders: ['accept', 'content-type', 'x-custom'],
```

### Host Header Behavior

The `host` header is **stripped** from proxied requests and `x-forwarded-host` is set to the original host value instead. This prevents routing issues with CDNs that use the `host` header for routing.

The following headers cannot be modified by `identity` or `transform`:

- `host` (also stripped from forwarded headers)
- `connection`
- `content-length`
- `transfer-encoding`

### Timeout

Defaults to **10,000ms** (10 seconds). Uses `AbortController` with `setTimeout`.
