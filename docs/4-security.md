# Security (CORS, CSP, rate limiting)

Configure CORS, CSP, and rate limiting to lock down your BFF layer.

```ts
security: {
  cors: {
    origin: ['https://myapp.com'],
    credentials: true,
    methods: ['get', 'post', 'put', 'delete', 'patch'],
    allowedHeaders: ['content-type', 'authorization'],
    exposedHeaders: ['x-custom-header'],
    maxAge: 3600,
  },
  csp: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'", 'https://api.example.com'],
    },
  },
  rateLimit: {
    maxRequests: 100,
    windowMs: 900000, // 15 minutes
  },
}
```

## CORS

Applied to all routes via `hono/cors`.

| Field            | Default                                     | Description                                           |
| ---------------- | ------------------------------------------- | ----------------------------------------------------- |
| `origin`         | `['*']`                                     | Allowed origins (string or string array)              |
| `credentials`    | `false`                                     | Include credentials in CORS requests                  |
| `methods`        | `['get', 'post', 'put', 'delete', 'patch']` | Allowed HTTP methods (supports `'head'`, `'options'`) |
| `allowedHeaders` | `undefined`                                 | Allowed request headers                               |
| `exposedHeaders` | `undefined`                                 | Headers exposed to the client                         |
| `maxAge`         | `undefined`                                 | Preflight cache duration in seconds                   |

Wildcard origin (`'*'`) cannot be combined with `credentials: true` — the validator will throw.

## CSP

Applied via `hono/secure-headers`. Always active — defaults to a restrictive policy if not specified.

Directive keys must use **camelCase** (`defaultSrc`), not kebab-case (`default-src`) — the validator throws on kebab-case keys.

### Default CSP directives

If no CSP is specified, these defaults apply:

| Directive                 | Default value                   |
| ------------------------- | ------------------------------- |
| `baseUri`                 | `["'self'"]`                    |
| `defaultSrc`              | `["'self'"]`                    |
| `fontSrc`                 | `["'self'", 'https:', 'data:']` |
| `formAction`              | `["'self'"]`                    |
| `frameAncestors`          | `["'self'"]`                    |
| `frameSrc`                | `["'self'"]`                    |
| `imgSrc`                  | `["'self'", 'data:']`           |
| `objectSrc`               | `["'none'"]`                    |
| `scriptSrc`               | `["'self'"]`                    |
| `scriptSrcAttr`           | `["'none'"]`                    |
| `styleSrc`                | `["'self'", 'https:']`          |
| `upgradeInsecureRequests` | `[]`                            |

### OpenAPI CSP overrides

When OpenAPI is enabled, the Swagger UI routes use relaxed CSP directives to allow the Scalar UI to load external resources (scripts from `cdn.jsdelivr.net`, inline styles). A warning is logged at startup. Custom CSP settings do not apply to these routes.

## Rate limiting

IP-based sliding window. Opt-in — not enabled unless `security.rateLimit` is configured.

| Field         | Default  | Description                        |
| ------------- | -------- | ---------------------------------- |
| `maxRequests` | `100`    | Maximum requests per window        |
| `windowMs`    | `900000` | Window duration in ms (15 minutes) |

Client IP is extracted from `x-forwarded-for` (first value) or falls back to `'unknown'`. When exceeded, returns `429 Too Many Requests` with a `Retry-After` header (seconds until window reset).
