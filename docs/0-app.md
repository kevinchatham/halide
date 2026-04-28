# App hosting

Serve static assets with client-side routing support, or use as a pure backend API server.

```ts
app: {
  name: 'my-app',          // used in log output (default: 'app')
  root: './dist/browser',  // directory of built static assets (optional when not serving static files)
  fallback: 'index.html',  // served for unmatched routes (client-side routing)
  apiPrefix: '/api',       // paths with this prefix get 404 instead of app fallback
  port: 3553,              // server listen port
}
```

`app.root` is optional. When omitted, the server acts as a pure backend API without static file serving.

| Field       | Default        | Description                                                                 |
| ----------- | -------------- | --------------------------------------------------------------------------- |
| `name`      | `'app'`        | Used in log output to identify this server instance                         |
| `root`      | (optional)     | Directory of built static assets. Omit for pure backend mode                |
| `fallback`  | `'index.html'` | Served when no static file or API route matches                             |
| `apiPrefix` | `'/api'`       | Paths with this prefix get 404 instead of app fallback. Set `''` to disable |
| `port`      | `3553`         | Server listen port                                                          |

Port resolution order: `PORT` environment variable → `app.port` → default `3553`.
