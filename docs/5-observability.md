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
