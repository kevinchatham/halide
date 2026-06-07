# Observability

Attach logging, request IDs, and lifecycle hooks for visibility into every request.

A styled default logger is used when none is provided (colored in TTY, plain text otherwise). Use `createNoopLogger()` for silent output.

```ts
import { createDefaultLogger, defineHalide, type HalideContext } from 'halide';

type MyLogScope = { requestId: string; service: string };
type App = HalideContext<MyClaims, MyLogScope>;

const { createServer } = defineHalide<App>();

const server = createServer({
  observability: {
    requestId: true, // generates/forwards x-request-id headers
    logger: createDefaultLogger(),
    logScopeFactory: (ctx, claims) => ({
      requestId: ctx.headers?.['x-request-id'] ?? 'no-request-id',
      service: 'bff',
    }),
    onRequest: (ctx, app) => {
      // The logger is already scoped via logScopeFactory — pass overrides as an object
      app.logger.info({ message: `${ctx.method} ${ctx.path}` });
    },
    onResponse: (ctx, app, { statusCode, durationMs }) => {
      // The logger is already scoped — pass overrides as an object
      app.logger.info({ message: `${ctx.method} ${ctx.path}`, status: statusCode, duration: durationMs });
    },
  },
});
```

Per-route observability is controlled with the `observe` flag. Set `observe: false` on a route to skip hooks for that route.

### Configuration fields

| Field             | Default                 | Description                                                                                                                          |
| ----------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `requestId`       | `false`                 | Enable `x-request-id` header propagation.                                                                                            |
| `logger`          | `createDefaultLogger()` | Custom logger instance. Colored in TTY, plain text otherwise. Use `createNoopLogger()` for silent output.                            |
| `logScopeFactory` | (none)                  | Factory that produces a typed log scope per request. Automatically passed to every logger call.                                      |
| `maxCollect`      | `1024`                  | Maximum bytes to collect from proxy responses for observability logging. Full response is unmodified.                                |
| `formatMessage`   | `true`                  | Controls output format of the default logger. `true` outputs formatted plain text (`[LEVEL] key=val`), `false` outputs compact JSON. |
| `onRequest`       | (none)                  | Hook called before each request is handled.                                                                                          |
| `onResponse`      | (none)                  | Hook called after each response is sent.                                                                                             |

## Logger interface

The `Logger` interface is generic over a log scope type `TLogScope`, allowing structured logging with a context object as the first parameter:

```ts
interface Logger<TLogScope = unknown> {
  debug: (overrides?: Partial<TLogScope>) => void;
  error: (overrides?: Partial<TLogScope>) => void;
  info: (overrides?: Partial<TLogScope>) => void;
  warn: (overrides?: Partial<TLogScope>) => void;
}
```

Each method accepts an optional `Partial<TLogScope>` for per-call overrides. When `logScopeFactory` is configured, the framework merges the per-request scope with these overrides automatically — callers simply pass `logger.info({ userId: '123' })` and the framework appends the request-level scope.

Built-in logger factories:

- **`createDefaultLogger()`** — styled logger with colored, level-prefixed messages. Uses `node:util.styleText` for colors in TTY, plain text otherwise.
- **`createNoopLogger()`** — discards all log messages.
- **`createScopedLogger(logger, scope)`** — wraps a logger so every method automatically applies a fixed scope. The returned logger ignores the scope argument passed to each method, using the pre-baked scope instead. Caller-provided overrides are merged with the baked-in scope (overrides take precedence). This means handlers and hooks can call `logger.info({ userId: '123' })` without manually passing a scope object.

When `logScopeFactory` is configured, the framework creates a scoped logger per request. The factory produces a typed scope value that is automatically applied to every logger call within that request. Handlers and hooks receive the scoped logger via `app.logger` and simply call `logger.info({ userId: '123' })` — the scope is injected automatically.

## Lifecycle hooks

- **`onRequest(ctx, app)`** — called after auth/authorization, before handler
- **`onResponse(ctx, app, response)`** — called after handler completes (including on error)

The `app` parameter is a `HalideContext<TClaims, TLogScope>` containing `claims` (decoded JWT) and `logger` (structured logger).

The `response` object (type `ResponseContext`) has the following shape:

| Field        | Type                 | Description                             |
| ------------ | -------------------- | --------------------------------------- |
| `statusCode` | `number`             | HTTP status code of the response        |
| `durationMs` | `number`             | Time in milliseconds from request start |
| `error?`     | `Error`              | Error thrown during request processing  |
| `body?`      | `unknown`            | Response body returned by the handler   |
| `bodyType?`  | `'text' \| 'binary'` | Format of the body field                |

`ResponseContext` is available for type annotation in `onResponse` hooks.

## Request ID middleware

When `observability.requestId` is `true`, every request gets an `x-request-id` header. If the incoming request already has an `x-request-id` header, it is forwarded as-is. Otherwise, a new UUID is generated via `crypto.randomUUID()`.
