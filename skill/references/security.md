# Security — CORS, CSP, Rate Limiting

## CORS

Applied to all routes via `hono/cors` in `createApp()`.

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

**Defaults:** `origin: []`, `credentials: false`, `methods: ['get', 'post', 'put', 'delete', 'patch']`.

| Field            | Default                                     | Description                              |
| ---------------- | ------------------------------------------- | ---------------------------------------- |
| `origin`         | `[]`                                        | Allowed origins (string or string array) |
| `credentials`    | `false`                                     | Include credentials in CORS requests     |
| `methods`        | `['get', 'post', 'put', 'delete', 'patch']` | Allowed HTTP methods                     |
| `allowedHeaders` | `undefined`                                 | Allowed request headers                  |
| `exposedHeaders` | `undefined`                                 | Headers exposed to the client            |
| `maxAge`         | `undefined`                                 | Preflight cache duration in seconds      |

**Gotcha:** Wildcard origin (`'*'`) cannot be combined with `credentials: true` — the validator will throw.

When `credentials` is true, CSRF protection is also enabled with the CORS origins.

## CSP

Applied via `hono/secure-headers` using `createSecurityMiddleware()`. Always active — defaults to a restrictive policy if not specified.

```typescript
security: {
  csp: {
    baseUri: ["'self'"],
    defaultSrc: ["'self'"],
    fontSrc: ["'self'", 'https:', 'data:'],
    formAction: ["'self'"],
    frameAncestors: ["'self'"],
    frameSrc: ["'self'"],
    imgSrc: ["'self'", 'data:'],
    objectSrc: ["'none'"],
    scriptSrc: ["'self'"],
    scriptSrcAttr: ["'none'"],
    styleSrc: ["'self'"],
    upgradeInsecureRequests: [],
  },
}
```

**Gotcha:** CSP directive keys must use **camelCase** (`defaultSrc`), NOT kebab-case (`default-src`). The validator throws on kebab-case keys.

### CSP Directive Values

Each directive accepts `string | ContentSecurityPolicyOptionHandler` (from `hono/secure-headers`).

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
styleSrc: ["'self'"]
upgradeInsecureRequests: []
```

### OpenAPI CSP Overrides

When OpenAPI is enabled, the Swagger UI routes use relaxed CSP directives to allow Scalar UI to load external resources (scripts from `cdn.jsdelivr.net`, inline styles). A warning is logged at startup. Custom CSP settings do not apply to these routes.

## Rate Limiting

IP-based sliding window. Opt-in — not enabled unless `security.rateLimit` is configured.

```typescript
security: {
  rateLimit: {
    maxRequests: 100,       // default: 100
    windowMs: 900000,       // default: 900000 (15 minutes)
    trustedProxies: ['10.0.0.0/8'],  // optional — trust x-forwarded-for from these IPs/CIDRs
    maxEntries: 1000,       // optional — max store entries; oldest evicted when exceeded
    redisClient?: RedisClient,  // optional — distributed rate limiting
  },
}
```

Client IP is extracted from `x-forwarded-for` (first value) when socket IP matches a trusted proxy, or falls back to socket IP. Returns `429 Too Many Requests` with `Retry-After` header. Uses an in-memory store with periodic cleanup (dispose-based).

| Field            | Default     | Description                                            |
| ---------------- | ----------- | ------------------------------------------------------ |
| `maxRequests`    | `100`       | Maximum requests per window                            |
| `windowMs`       | `900000`    | Window duration in ms (15 minutes)                     |
| `trustedProxies` | `[]`        | Trusted proxy IPs/CIDRs for x-forwarded-for validation |
| `maxEntries`     | `undefined` | Max store entries; oldest evicted when exceeded        |
| `redisClient`    | `undefined` | Redis client for distributed rate limiting             |
