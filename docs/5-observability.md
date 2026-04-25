# Observability

Attach logging, request IDs, and lifecycle hooks for visibility into every request.

```ts
observability: {
  requestId: true,       // generates/forwards x-request-id headers
  logger: myLogger,      // your Logger implementation (defaults to no-op if omitted)
  onRequest: (ctx, claims, logger) => {
    logger.info(`${ctx.method} ${ctx.path}`);
  },
  onResponse: (ctx, claims, response, logger) => {
    logger.info(`${ctx.method} ${ctx.path} ${response.statusCode} ${response.durationMs}ms`);
  },
}
```

Per-route observability is controlled with the `observe` flag. Set `observe: false` on a route to skip hooks for that route.

## Logger interface

```ts
interface Logger {
  debug: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
}
```

If no logger is provided, a no-op logger is used (all methods are empty functions).

## Lifecycle hooks

- **`onRequest(ctx, claims, logger)`** — called after auth/authorization, before handler
- **`onResponse(ctx, claims, response, logger)`** — called after handler completes (including on error)

The `response` object has the following shape:

| Field        | Type     | Description                                   |
| ------------ | -------- | --------------------------------------------- |
| `statusCode` | `number` | HTTP status code of the response              |
| `durationMs` | `number` | Time in milliseconds from request start       |
| `error?`     | `Error`  | Error thrown by the handler (undefined if OK) |

Note: `ResponseContext` exists in `src/types.ts` but is **not exported** from `index.ts`.

## Request ID middleware

When `observability.requestId` is `true`, every request gets an `x-request-id` header. If the incoming request already has an `x-request-id` header, it is forwarded as-is. Otherwise, a new UUID is generated via `crypto.randomUUID()`.
