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

## ResponseContext

The `onResponse` hook receives a `ResponseContext` object:

| Field        | Type     | Description                                   |
| ------------ | -------- | --------------------------------------------- |
| `statusCode` | `number` | HTTP status code of the response              |
| `durationMs` | `number` | Time in milliseconds from request start       |
| `error?`     | `Error`  | Error thrown by the handler (undefined if OK) |

Note: `ResponseContext` exists in `src/types.ts` but is **not exported** from `index.ts`.
