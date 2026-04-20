# Security (CORS, CSP, rate limiting)

Configure CORS, CSP, and rate limiting to lock down your BFF layer.

```ts
security: {
  cors: {
    origin: ['https://myapp.com'],
    credentials: true,
    methods: ['get', 'post', 'put', 'delete', 'patch'],
    allowedHeaders: ['content-type', 'authorization'],
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
    windowMs: 900000,  // 15 minutes
  },
}
```

- **CORS**: Wildcard origin (`*`) cannot be combined with `credentials: true`. The validator will catch this.
- **CSP**: Applied via `hono/secure-headers`. Defaults to a restrictive policy if not specified.
- **Rate limiting**: IP-based sliding window. Defaults to 100 requests per 15 minutes.
