# SPA hosting

Serve static assets with client-side routing support.

```ts
spa: {
  name: 'my-app',          // used in log output (default: 'app')
  root: './dist/browser',  // directory of built static assets (required)
  fallback: 'index.html',  // served for unmatched routes (client-side routing)
  apiPrefix: '/api',       // paths with this prefix get 404 instead of SPA fallback
  port: 3553,              // server listen port
}
```

`spa.root` is the only required field. All other fields have defaults:

| Field       | Default        | Description                                                                 |
| ----------- | -------------- | --------------------------------------------------------------------------- |
| `name`      | `'app'`        | Used in log output to identify this server instance                         |
| `fallback`  | `'index.html'` | Served when no static file or API route matches                             |
| `apiPrefix` | `'/api'`       | Paths with this prefix get 404 instead of SPA fallback. Set `''` to disable |
| `port`      | `3553`         | Server listen port                                                          |

Port resolution order: `PORT` environment variable → `spa.port` → default `3553`.
