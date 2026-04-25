# Observability

## Configuration

```typescript
observability: {
  requestId: true,       // generates/forwards x-request-id headers
  logger: myLogger,      // defaults to no-op Logger if omitted
  onRequest: (ctx, claims, logger) => { ... },
  onResponse: (ctx, claims, response, logger) => { ... },
}
```

## Logger Interface

```typescript
interface Logger {
  debug: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
}
```

If no logger is provided, a no-op logger is used (all methods are empty functions).

## Lifecycle Hooks

- `onRequest(ctx, claims, logger)` — called after auth/authorization, before handler
- `onResponse(ctx, claims, response, logger)` — called after handler completes

The `response` object contains:

```typescript
interface ResponseContext {
  statusCode: number;
  durationMs: number;
  error?: Error;
}
```

## Per-Route Observability

Set `observe: false` on a route to skip `onRequest`/`onResponse` hooks for that specific route.

## Request ID Middleware

When `observability.requestId` is `true`, every request gets an `x-request-id` header. If the incoming request already has an `x-request-id` header, it is forwarded as-is. Otherwise, a new UUID is generated via `crypto.randomUUID()`.
