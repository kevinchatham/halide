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
    redisClient: redis, // optional: Redis client for distributed rate limiting
  },
}
```

## CORS

Applied to all routes via `hono/cors`.

| Field            | Default                                     | Description                                                        |
| ---------------- | ------------------------------------------- | ------------------------------------------------------------------ |
| `origin`         | `[]`                                        | Allowed origins (string or string array). Empty means same origin. |
| `credentials`    | `false`                                     | Include credentials in CORS requests                               |
| `methods`        | `['get', 'post', 'put', 'delete', 'patch']` | Allowed HTTP methods (supports `'head'`, `'options'`)              |
| `allowedHeaders` | `undefined`                                 | Allowed request headers                                            |
| `exposedHeaders` | `undefined`                                 | Headers exposed to the client                                      |
| `maxAge`         | `undefined`                                 | Preflight cache duration in seconds                                |

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
| `styleSrc`                | `["'self'"]`                    |
| `upgradeInsecureRequests` | `[]`                            |

Additional directives available but not set by default: `childSrc`, `connectSrc`, `manifestSrc`, `mediaSrc`, `sandbox`, `scriptSrcElem`, `styleSrcAttr`, `styleSrcElem`, `workerSrc`.

### OpenAPI CSP overrides

When OpenAPI is enabled, the Swagger UI routes use relaxed CSP directives to allow the Scalar UI to load external resources (scripts from `cdn.jsdelivr.net`, inline styles). A warning is logged at startup. Custom CSP settings do not apply to these routes.

## Rate limiting

Opt-in — not enabled unless `security.rateLimit` is configured. Uses a sliding window algorithm with in-memory storage and periodic cleanup.

| Field            | Default  | Description                                                                     |
| ---------------- | -------- | ------------------------------------------------------------------------------- |
| `maxRequests`    | `100`    | Maximum requests per window                                                     |
| `windowMs`       | `900000` | Window duration in ms (15 minutes)                                              |
| `trustedProxies` | (none)   | Trusted proxy IPs/CIDRs. When set, `x-forwarded-for` is only trusted from these |
| `maxEntries`     | (none)   | Maximum entries in the rate limit store. Oldest entries evicted when exceeded   |
| `redisClient`    | (none)   | Redis client for distributed rate limiting across multiple server instances     |

Client IP is extracted from `x-forwarded-for` (first value) when the socket IP matches a trusted proxy, or falls back to socket IP (or `'unknown'` if socket IP is unavailable). When exceeded, returns `429 Too Many Requests` with a `Retry-After` header (seconds until window reset).
