# Testing Utilities

Utilities in `src/test-utils` for unit testing Halide apps without starting a full server.

## createTestApp

Creates a Hono application configured with routes and selective middleware for testing. Does not start a server — returns a `Hono` app you can call `.request()` on.

```typescript
import { createTestApp } from 'halide/test-utils';

const app = createTestApp(config, options?);
```

### Parameters

- `config: ServerConfig` — the same config object you'd pass to `createServer()`. Routes are registered from this config.
- `options?: TestAppOptions` — flags to selectively enable middleware. All default to `false`.

### Returns

A `Hono<{ Variables: HalideVariables }>` app with routes registered.

### Example

```typescript
import { defineHalide } from 'halide';
import { createTestApp, noopLogger } from 'halide/test-utils';

const { apiRoute } = defineHalide();

const app = createTestApp(
  {
    apiRoutes: [
      apiRoute({
        access: 'public',
        path: '/health',
        handler: async () => ({ status: 'ok' }),
      }),
    ],
    security: {
      rateLimit: { maxRequests: 10 },
    },
  },
  {
    cors: true,
    csp: true,
    rateLimit: true,
    errorHandler: true,
  },
);

const res = await app.request('/health');
expect(res.status).toBe(200);
```

## TestAppOptions

Flags for enabling specific middleware pipelines during testing. All default to `false` for backward compatibility.

```typescript
type TestAppOptions = {
  cors?: boolean; // Apply CORS + CSRF middleware
  csp?: boolean; // Apply CSP security headers middleware
  rateLimit?: boolean; // Apply rate limiting middleware
  requestId?: boolean; // Apply request ID middleware
  errorHandler?: boolean; // Apply global error handler middleware
  appHandler?: boolean; // Apply SPA fallback + static file handler
  logger?: Logger; // Logger override — defaults to noopLogger
};
```

## noopLogger

Pre-created noop logger that discards all log messages. Use to suppress output during tests.

```typescript
import { noopLogger } from 'halide/test-utils';

const app = createTestApp(config, { logger: noopLogger });
```

## disposeRateLimit

Cleanup function for rate limit tests. When `createTestApp` is called with `{ rateLimit: true }`, the rate limit middleware's dispose function is stored internally. Call `disposeRateLimit(app)` after tests complete to release resources (clears the cleanup timer).

```typescript
import { createTestApp, disposeRateLimit } from 'halide/test-utils';

const app = createTestApp(config, { rateLimit: true });

// ... run tests ...

disposeRateLimit(app); // returns true if disposed, false if no rate limit was active
```

Returns `boolean` — `true` if a dispose function was found and invoked, `false` otherwise.

## Key Differences from createApp

| Aspect     | `createTestApp`               | `createApp` / `createServer` |
| ---------- | ----------------------------- | ---------------------------- |
| Middleware | Selective via options         | All applied automatically    |
| Validation | Skipped                       | Full config validation       |
| Logger     | Noop by default               | Styled default logger        |
| Server     | Not started                   | Starts HTTP server           |
| Cleanup    | Manual via `disposeRateLimit` | Automatic on shutdown        |
