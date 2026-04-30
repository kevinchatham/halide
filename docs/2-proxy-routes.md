# Proxy routes

Proxy routes forward requests to a backend service. Use them when you don't need to compose data and just want to pass through.

Use the `proxyRoute()` factory to create routes — it fills in the `type` field and provides a default `authorize` function:

```ts
import { proxyRoute } from 'halide';

const productsProxy = proxyRoute({
  access: 'private',
  path: '/api/products',
  methods: ['get', 'post'],
  target: 'http://products.internal',
  proxyPath: '/products',
  timeout: 5000,
  identity: (ctx, claims) => ({
    'x-user-id': claims.sub,
  }),
  transform: ({ method, body, headers }) => ({
    body: { ...body, source: 'halide' },
    headers,
  }),
});
```

## Key details

- **`methods` is required** — unlike `apiRoute`'s optional `method`, proxy routes require an array of methods. Supported: `'get'`, `'post'`, `'put'`, `'patch'`, `'delete'`.
- **`proxyPath` defaults to `path`** — if omitted, the route path is used as-is for path prefix rewriting.
- **`timeout` defaults to `60000`** (60 seconds) — uses `AbortSignal.timeout()` to abort slow requests.
- **`identity(ctx, claims)`** — only called when `claims` is defined (private routes with successful auth). Returns a record of headers to inject into the proxied request.
- **`transform({ method, body, headers })`** — called when present. `method` is the lowercase HTTP method. Body is JSON-stringified, headers are normalized to lowercase keys. Without transform, the raw request body is forwarded as-is.

## Path rewriting

The `path` is the incoming route prefix. The `proxyPath` (defaults to `path` if omitted) is the prefix on the target. The incoming path prefix is replaced with `proxyPath`:

```
Incoming: /api/products/123
path:     /api/products
proxyPath: /products
Result:   http://target/products/123
```

### Wildcard paths

If `path` ends with `/*`, it matches all sub-paths. If `proxyPath` also ends with `/*`, the matched suffix is preserved. If `proxyPath` is a plain path, the suffix is still appended.

```
# Wildcard with wildcard proxyPath
Incoming: /api/users/123
path:     /api/*
proxyPath: /backend/*
Result:   http://target/backend/users/123

# Wildcard with plain proxyPath
Incoming: /api/users/123
path:     /api/*
proxyPath: /backend
Result:   http://target/backend/users/123
```

## Host header behavior

The original `Host` header from the client request is **not** forwarded to the backend. Instead, the `host` header is derived from the target URL. The original host value is preserved as `x-forwarded-host`.

This prevents routing issues with CDNs that use the `host` header to route requests — forwarding the client's host header would cause 404 errors.

The following headers are stripped from proxied requests and cannot be overridden by `identity` or `transform`:

- `host`
- `connection`
- `content-length`
- `transfer-encoding`
- `set-cookie` (multi-value, not writable)
