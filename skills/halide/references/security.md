# Security — CORS, CSP, Rate Limiting

## CORS

Applied to all routes via `hono/cors`.

```typescript
security: {
  cors: {
    origin: ['http://localhost:4200'],
    credentials: true,
    methods: ['get', 'post', 'put', 'delete', 'patch'],
    allowedHeaders: ['content-type', 'authorization'],
    exposedHeaders: ['x-custom-header'],
    maxAge: 3600,
  },
}
```

**Defaults:** `origin: ['*']`, `credentials: false`, `methods: ['get', 'post', 'put', 'delete', 'patch']`.

**Gotcha:** Wildcard origin (`'*'`) cannot be combined with `credentials: true` — the validator will throw.

## CSP

Applied via `hono/secure-headers`. Always active — defaults to a restrictive policy if not specified.

```typescript
security: {
  csp: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'", 'https://api.example.com'],
      styleSrc: ["'self'", 'https:', "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      fontSrc: ["'self'", 'https:', 'data:'],
      frameAncestors: ["'self'"],
      formAction: ["'self'"],
      objectSrc: ["'none'"],
      scriptSrcAttr: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
}
```

**Gotcha:** CSP directive keys must use **camelCase** (`defaultSrc`), NOT kebab-case (`default-src`). The validator throws on kebab-case keys.

### Available CSP Directives

All directive keys use camelCase:

| Directive                 | Type                  |
| ------------------------- | --------------------- |
| `baseUri`                 | `CspDirectiveValue[]` |
| `childSrc`                | `CspDirectiveValue[]` |
| `connectSrc`              | `CspDirectiveValue[]` |
| `defaultSrc`              | `CspDirectiveValue[]` |
| `fontSrc`                 | `CspDirectiveValue[]` |
| `formAction`              | `CspDirectiveValue[]` |
| `frameAncestors`          | `CspDirectiveValue[]` |
| `frameSrc`                | `CspDirectiveValue[]` |
| `imgSrc`                  | `CspDirectiveValue[]` |
| `manifestSrc`             | `CspDirectiveValue[]` |
| `mediaSrc`                | `CspDirectiveValue[]` |
| `objectSrc`               | `CspDirectiveValue[]` |
| `sandbox`                 | `CspDirectiveValue[]` |
| `scriptSrc`               | `CspDirectiveValue[]` |
| `scriptSrcAttr`           | `CspDirectiveValue[]` |
| `scriptSrcElem`           | `CspDirectiveValue[]` |
| `styleSrc`                | `CspDirectiveValue[]` |
| `styleSrcAttr`            | `CspDirectiveValue[]` |
| `styleSrcElem`            | `CspDirectiveValue[]` |
| `upgradeInsecureRequests` | `CspDirectiveValue[]` |
| `workerSrc`               | `CspDirectiveValue[]` |

`CspDirectiveValue` is `string | ContentSecurityPolicyOptionHandler`.

### Default CSP Directives

If no CSP is specified, these defaults apply:

```
baseUri: ["'self'"]
defaultSrc: ["'self'"]
fontSrc: ["'self'", 'https:', 'data:']
formAction: ["'self'"]
frameAncestors: ["'self'"]
frameSrc: ["'self'"]
imgSrc: ["'self'", 'data:']
objectSrc: ["'none'"]
scriptSrc: ["'self'"]
scriptSrcAttr: ["'none'"]
styleSrc: ["'self'", 'https:', "'unsafe-inline'"]
upgradeInsecureRequests: []
```

## Rate Limiting

IP-based sliding window. Opt-in — not enabled unless `security.rateLimit` is configured.

```typescript
security: {
  rateLimit: {
    maxRequests: 100,    // default: 100
    windowMs: 900000,    // default: 900000 (15 minutes)
  },
}
```

Client IP is determined from `x-forwarded-for` header (first value) or falls back to `'unknown'`. Returns `429 Too Many Requests` with `Retry-After` header when exceeded.
