# Observability

Attach logging, request IDs, and lifecycle hooks for visibility into every request.

```ts
type MyLogScope = { requestId: string; service: string };

observability: {
  requestId: true,       // generates/forwards x-request-id headers
  logger: {
    debug: (scope) => myLogger.debug(scope),
    error: (scope) => myLogger.error(scope),
    info: (scope) => myLogger.info(scope),
    warn: (scope) => myLogger.warn(scope),
  },
  onRequest: (ctx, app) => {
    app.logger.info(ctx, `${ctx.method} ${ctx.path}`);
  },
  onResponse: (ctx, app, response) => {
    app.logger.info(ctx, `${ctx.method} ${ctx.path} ${response.statusCode} ${response.durationMs}ms - body:`, response.body);
  },
}
```

Per-route observability is controlled with the `observe` flag. Set `observe: false` on a route to skip hooks for that route.

### Configuration fields

| Field        | Default | Description                                                                                           |
| ------------ | ------- | ----------------------------------------------------------------------------------------------------- |
| `requestId`  | `false` | Enable `x-request-id` header propagation.                                                             |
| `logger`     | (none)  | Custom logger instance. Styled default logger used when omitted.                                      |
| `maxCollect` | `1024`  | Maximum bytes to collect from proxy responses for observability logging. Full response is unmodified. |
| `onRequest`  | (none)  | Hook called before each request is handled.                                                           |
| `onResponse` | (none)  | Hook called after each response is sent.                                                              |

## Logger interface

The `Logger` interface is generic over a log scope type `TLogScope`, allowing structured logging with a context object as the first parameter:

```ts
interface Logger<TLogScope = unknown> {
  debug: (scope: TLogScope, ...args: unknown[]) => void;
  error: (scope: TLogScope, ...args: unknown[]) => void;
  info: (scope: TLogScope, ...args: unknown[]) => void;
  warn: (scope: TLogScope, ...args: unknown[]) => void;
}
```

If no logger is provided, a styled default logger is used (colored in TTY, plain text otherwise).

## Lifecycle hooks

- **`onRequest(ctx, app)`** — called after auth/authorization, before handler
- **`onResponse(ctx, app, response)`** — called after handler completes (including on error)

The `app` parameter is a `THalideApp<TClaims, TLogScope>` containing `claims` (decoded JWT) and `logger` (structured logger).

The `response` object (type `ResponseContext`) has the following shape:

| Field        | Type      | Description                                   |
| ------------ | --------- | --------------------------------------------- |
| `statusCode` | `number`  | HTTP status code of the response              |
| `durationMs` | `number`  | Time in milliseconds from request start       |
| `error?`     | `Error`   | Error thrown by the handler (undefined if OK) |
| `body?`      | `unknown` | Response body returned by the handler         |

Note: `ResponseContext` is exported from `index.ts` and used by the `onResponse` hook.

## Request ID middleware

When `observability.requestId` is `true`, every request gets an `x-request-id` header. If the incoming request already has an `x-request-id` header, it is forwarded as-is. Otherwise, a new UUID is generated via `crypto.randomUUID()`.
