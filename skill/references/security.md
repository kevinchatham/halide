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

## CSRF Protection

When `credentials: true` is set in CORS config, CSRF protection is **automatically enabled** using `hono/csrf`. The CSRF middleware uses the configured CORS origins as allowed origins. No additional configuration is needed — it is applied transparently alongside CORS.

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
    maxEntries: 10000,      // default: 10000 — max store entries; oldest evicted when exceeded
    redisClient?: RedisClient,  // optional — distributed rate limiting
  },
}
```

Client IP is extracted from `x-forwarded-for` (first value) when socket IP matches a trusted proxy, or falls back to socket IP. Returns `429 Too Many Requests` with `Retry-After` header. Uses an in-memory store with periodic cleanup (dispose-based).

**Warning:** Without `redisClient`, rate limiting uses an in-memory store that is per-instance only and will not share state across multiple server instances. Configure `redisClient` for distributed rate limiting.

| Field            | Default     | Description                                            |
| ---------------- | ----------- | ------------------------------------------------------ |
| `maxRequests`    | `100`       | Maximum requests per window                            |
| `windowMs`       | `900000`    | Window duration in ms (15 minutes)                     |
| `trustedProxies` | `[]`        | Trusted proxy IPs/CIDRs for x-forwarded-for validation |
| `maxEntries`     | `10000`     | Max store entries; oldest evicted when exceeded        |
| `redisClient`    | `undefined` | Redis client for distributed rate limiting             |

## Redis Client

The `RedisClient` interface defines the minimal Redis operations required for distributed rate limiting. It is exported from `halide` so consumers can type-check their implementation. Compatible with `ioredis`, `redis`, or any Redis client.

### Interface

```typescript
interface RedisClient {
  expire(key: string, seconds: number): Promise<number>;
  incr(key: string): Promise<number>;
  pttl(key: string): Promise<number>;
}
```

### Method Descriptions

| Method                 | Description                                                                       |
| ---------------------- | --------------------------------------------------------------------------------- |
| `expire(key, seconds)` | Set the expiration (in seconds) for the given key. Returns 1 if set, 0 otherwise. |
| `incr(key)`            | Increment the integer value of the given key by 1. Returns the new value.         |
| `pttl(key)`            | Get the remaining time to live (in milliseconds) for the given key.               |

### Usage

Pass a `RedisClient` implementation via `security.rateLimit.redisClient`:

```typescript
import { createClient } from 'redis';
import type { RedisClient } from 'halide';

const redis = createClient({ url: 'redis://localhost:6379' });
await redis.connect();

const redisClient: RedisClient = {
  expire: (key, seconds) => redis.expire(key, seconds),
  incr: (key) => redis.incr(key),
  pttl: (key) => redis.pttl(key),
};

const server = createServer({
  security: {
    rateLimit: {
      maxRequests: 100,
      windowMs: 900000,
      redisClient,
    },
  },
});
```

Without `redisClient`, rate limiting uses an in-memory store that is per-instance only. In a multi-instance deployment (e.g., behind a load balancer), each instance maintains its own rate limit counters, meaning a client could exceed the intended limit by rotating between instances. Configuring `redisClient` ensures all instances share the same rate limit state.
