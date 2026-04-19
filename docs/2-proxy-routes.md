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
