# Proxy routes

Proxy routes forward requests to a backend service. Use them when you don't need to compose data and just want to pass through.

```ts
proxyRoutes: [
  {
    type: 'proxy',
    path: '/api/products',
    access: 'private',
    methods: ['get', 'post'],
    target: 'http://products.internal',
    proxyPath: '/products', // rewrites /api/products → /products on the target
    timeout: 5000, // ms before aborting
    identity: (ctx, claims) => ({
      'x-user-id': claims.sub, // headers injected into the proxied request
    }),
    transform: ({ body, headers }) => ({
      body: { ...body, source: 'halide' },
      headers,
    }),
  },
];
```

Use the `proxyRoute()` factory for the same convenience as `apiRoute()`:

```ts
import { proxyRoute } from 'halide';

const productsProxy = proxyRoute({
  access: 'private',
  path: '/api/products',
  methods: ['get'],
  target: 'http://products.internal',
  proxyPath: '/products',
});
```

## Key details

- **`methods` is required** — unlike `apiRoute`'s optional `method`, proxy routes require an array of methods.
- **`proxyPath` defaults to `path`** — if omitted, the route path is used as-is for path prefix rewriting. For example, `path: '/api/products'` rewrites to `/api/products` on the target.
- **`timeout` defaults to `60000`** (60 seconds) — uses `AbortSignal.timeout()` to abort slow requests.
- **`identity(ctx, claims)`** — only called when `claims` is defined (private routes with successful auth). Returns a record of headers to inject into the proxied request.
- **`transform({ body, headers })`** — called when present. Body is JSON-stringified, headers are normalized to lowercase. Without transform, the raw request body is forwarded as-is.
- Path rewriting replaces the `path` prefix with `proxyPath` in the request URL before forwarding to `target`.
