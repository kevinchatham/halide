# Observability

## Configuration

```typescript
type MyLogScope = { requestId: string; service: string };

observability: {
  requestId: true,       // generates/forwards x-request-id headers
  logger: {
    debug: (scope, ...args) => myLogger.debug(scope, ...args),
    error: (scope, ...args) => myLogger.error(scope, ...args),
    info: (scope, ...args) => myLogger.info(scope, ...args),
    warn: (scope, ...args) => myLogger.warn(scope, ...args),
  },
  onRequest: (ctx, app) => { app.logger.info(ctx, `${ctx.method} ${ctx.path}`); },
  onResponse: (ctx, app, response) => { app.logger.info(ctx, `${ctx.method} ${ctx.path} ${response.statusCode}`); },
}
```

## Logger Interface

The `Logger` interface is generic over a log scope type `TLogScope`:

```typescript
interface Logger<TLogScope = unknown> {
  debug: (scope: TLogScope, ...args: unknown[]) => void;
  error: (scope: TLogScope, ...args: unknown[]) => void;
  info: (scope: TLogScope, ...args: unknown[]) => void;
  warn: (scope: TLogScope, ...args: unknown[]) => void;
}
```

If no logger is provided, a no-op logger is used (all methods are empty functions).

## Lifecycle Hooks

- `onRequest(ctx, app)` — called after auth/authorization, before handler
- `onResponse(ctx, app, response)` — called after handler completes

The `app` parameter is a `THalideApp` containing `claims` (decoded JWT) and `logger` (structured logger).

The `response` object contains:

```typescript
interface ResponseContext {
  statusCode: number;
  durationMs: number;
  error?: Error;
  body?: unknown;
}
```

## Per-Route Observability

Set `observe: false` on a route to skip `onRequest`/`onResponse` hooks for that specific route.

## Request ID Middleware

When `observability.requestId` is `true`, every request gets an `x-request-id` header. If the incoming request already has an `x-request-id` header, it is forwarded as-is. Otherwise, a new UUID is generated via `crypto.randomUUID()`.
