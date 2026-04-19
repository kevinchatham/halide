# SPA hosting

Serve static assets with client-side routing support.

```ts
spa: {
  name: 'my-app',          // used in log output
  root: './dist/browser',  // directory of built static assets
  fallback: 'index.html',  // served for unmatched routes (client-side routing)
  apiPrefix: '/api',       // paths with this prefix get 404 instead of SPA fallback
}
```

`spa.root` is the only required field. `apiPrefix` defaults to `'/api'`. Set it to `''` to disable the 404 behavior.
