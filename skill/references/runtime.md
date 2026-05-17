# Runtime Lifecycle

## defineHalide Builder

The entry point for building Halide apps. Returns a builder pre-baked with `TClaims` and `TLogScope` type parameters.

```typescript
import { defineHalide } from 'halide';

const { apiRoute, proxyRoute, createApp, createServer } = defineHalide<UserClaims, LogScope>();
```

The builder provides:

- `apiRoute()` — factory for typed API routes
- `proxyRoute()` — factory for typed proxy routes
- `createApp()` — builds a Hono app (no server started)
- `createServer()` — builds a server with lifecycle management

## Server Interface

The `Server` interface provides lifecycle management with graceful shutdown.

```typescript
interface Server {
  ready: Promise<void>;
  start: (onReady?: (port: number) => void) => void;
  stop: () => Promise<void>;
}
```

- `ready` — Promise that resolves when the server is ready to accept connections
- `start(onReady)` — begins listening on the configured port. Calls `onReady` callback with the port number. Registers SIGINT/SIGTERM handlers for graceful shutdown.
- `stop()` — stops the server and closes all connections. Drains active requests (up to 30s timeout), disposes proxy HTTP agents and rate limit resources, then closes the HTTP server.

## CreateAppResult

Return type of `createApp()`. Contains the Hono app and cleanup functions.

```typescript
interface CreateAppResult {
  app: HonoApp;
  logger: Logger<unknown>;
  proxyDispose: (() => void) | undefined;
  rateLimitDispose: (() => void) | undefined;
}
```

- `app` — the configured Hono application with all middleware and routes
- `logger` — the logger instance used throughout the server
- `proxyDispose` — function to dispose of proxy HTTP agent connections. `undefined` when no proxy routes are configured.
- `rateLimitDispose` — function to dispose of rate limit resources (clears cleanup timer). `undefined` when rate limiting is disabled.

## Lifecycle Pipeline

When `createApp()` is called, the following steps execute in order:

1. **Logger setup** — uses provided logger or creates styled default
2. **Config validation** — synchronous (or async if secret is a function)
3. **CORS + CSRF** — `hono/cors` applied globally; `hono/csrf` added when `credentials: true`
4. **Rate limiting** — applied if `security.rateLimit` is configured
5. **OpenAPI CSP overrides** — relaxed CSP for Swagger routes (if OpenAPI enabled)
6. **CSP security headers** — `hono/secure-headers` applied globally
7. **Request ID** — applied if `observability.requestId` is enabled
8. **Route registration** — all API and proxy routes registered
9. **OpenAPI routes** — Scalar UI routes (if OpenAPI enabled)
10. **App handler** — static file serving + SPA fallback (if `app.root` is set)
11. **Error handler** — global error handler registered

## Graceful Shutdown

When the server receives SIGINT or SIGTERM:

1. Logs the signal received
2. Disposes rate limit resources (clears cleanup timer)
3. Disposes proxy HTTP agent connections
4. Closes all active connections on the HTTP server
5. Drains remaining active requests (checked every 1s, max 30s timeout)
6. If drain timeout is exceeded, forces shutdown with a warning log

## Port Resolution

Port is resolved in this order:

1. `PORT` environment variable
2. `app.port` from config
3. Default: **3553**

## Example

```typescript
import { defineHalide } from 'halide';

const { apiRoute, createServer } = defineHalide();

const server = createServer({
  apiRoutes: [
    apiRoute({
      access: 'public',
      handler: async () => ({ status: 'ok' }),
      path: '/health',
    }),
  ],
  app: {
    port: 3000,
  },
});

// Start and log when ready
server.start((port) => {
  console.log(`Listening on port ${port}`);
});

// Graceful shutdown
await server.stop();
```
