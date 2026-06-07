# Observability

## Configuration

```typescript
type MyLogScope = { requestId: string; service: string };

observability: {
  requestId: true,              // generates/forwards x-request-id headers
  logger: {
    debug: (overrides) => myLogger.debug(overrides),
    error: (overrides) => myLogger.error(overrides),
    info: (overrides) => myLogger.info(overrides),
    warn: (overrides) => myLogger.warn(overrides),
  },
  logScopeFactory: (ctx, claims) => ({ requestId: ctx.path }),  // optional — per-request scope
  maxCollect: 1024,             // optional — max bytes to collect from proxy responses (cap: 1MB)
  formatMessage: true,          // optional — true: formatted text, false: compact JSON (default: true)
  onRequest: (ctx, app) => { app.logger.info({ message: `${ctx.method} ${ctx.path}` }); },
  onResponse: (ctx, app, response) => {
    app.logger.info({ message: `${ctx.method} ${ctx.path}`, status: response.statusCode, duration: response.durationMs });
  },
}
```

## Default Logger

If no logger is provided, a structured default logger is used via `createDefaultLogger()`:

- **Formatted text mode** (default): `[LEVEL] key=val ...` with colors in TTY
- **JSON mode**: `{"level":"INFO","scope":{...}}` — set `formatMessage: false`
- Use `createNoopLogger()` for silent output

```typescript
import { createDefaultLogger, createNoopLogger } from 'halide';

// Formatted text (default)
const logger = createDefaultLogger();

// Compact JSON output
const jsonLogger = createDefaultLogger({ formatMessage: false });

// Silent
const noop = createNoopLogger();
```

## Logger Interface

The `Logger` interface is generic over a log scope type `TLogScope`. All methods accept a single optional object of overrides (merged with any scoped logger's baked-in scope):

```typescript
interface Logger<TLogScope = unknown> {
  debug: (overrides?: Partial<TLogScope>) => void;
  error: (overrides?: Partial<TLogScope>) => void;
  info: (overrides?: Partial<TLogScope>) => void;
  warn: (overrides?: Partial<TLogScope>) => void;
}
```

**Key change:** Methods take a single object argument, not `(scope, ...args)`. The scope object is merged with any pre-baked scope from `createScopedLogger`. Caller-provided keys win over baked-in keys (last-write-wins).

## Scoped Logger

`createScopedLogger` merges the caller's overrides with the baked-in scope:

```typescript
import { createDefaultLogger, createScopedLogger } from 'halide';

const base = createDefaultLogger();
const scoped = createScopedLogger(base, { service: 'bff' });

scoped.info({ requestId: 'abc123' });
// Output: [INFO] service="bff" requestId="abc123"

scoped.info({ message: 'request handled' });
// Output: [INFO] service="bff" message="request handled"

scoped.info({ requestId: 'override' });
// Output: [INFO] service="bff" requestId="override"  // caller wins
```

## Internal Logger

`asInternalLogger` wraps a typed logger for use in framework internals where ad-hoc scope objects are logged:

```typescript
import { createDefaultLogger, asInternalLogger } from 'halide';

const logger = createDefaultLogger();
const internal = asInternalLogger(logger);

internal.error({ validationErrors: ['field required'] });
// Output: [ERROR] validationErrors=["field required"]
```

## Log Scope Factory

The `logScopeFactory` produces a typed scope object for each request. It receives the normalized request context and JWT claims (if authenticated). The scope is automatically merged into every logger call via `createScopedLogger`, eliminating the need to manually pass scope in every `logger.info({ ... })` call.

```typescript
logScopeFactory: (ctx, claims) => ({
  requestId: ctx.headers?.['x-request-id'] ?? 'no-request-id',
  userId: claims?.sub ?? undefined,
  service: 'bff',
}),
```

## Lifecycle Hooks

- `onRequest(ctx, app)` — called after auth/authorization, before handler
- `onResponse(ctx, app, response)` — called after handler completes (including on error)

Hooks are wrapped in try/catch to prevent async errors from failing requests. Both hooks accept `void | Promise<void>`.

The `response` object (type `ResponseContext`) has the following shape:

```typescript
interface ResponseContext {
  statusCode: number;
  durationMs: number;
  error?: Error;
  body?: unknown;
  bodyType?: 'text' | 'binary'; // 'text' for API/proxy text, 'binary' for image/octet-stream
}
```

## Per-Route Observability

Set `observe: false` on a route to skip `onRequest`/`onResponse` hooks for that specific route.

## Request ID Middleware

When `observability.requestId` is `true`, every request gets an `x-request-id` header. If the incoming request already has an `x-request-id` header, it is forwarded as-is. Otherwise, a new UUID is generated via `crypto.randomUUID()`.

## Response Body Collection

For proxy routes, response bodies are collected up to `maxCollect` bytes (default: 1024) for observability logging. The full response is always piped through unmodified. Binary body content is decoded as text and may be garbled for non-text responses.

**Maximum cap:** `maxCollect` cannot exceed 1MB (1048576 bytes). Values above this limit are clamped.

## Types

```typescript
type RequestContext = {
  method: 'get' | 'post' | 'put' | 'patch' | 'delete' | 'head' | 'options';
  path: string;
  headers: Record<string, string | string[]>;
  params: Record<string, string>;
  query: Record<string, string | string[]>;
  body?: unknown;
};

type ResponseContext = {
  statusCode: number;
  durationMs: number;
  error?: Error;
  body?: unknown;
  bodyType?: 'text' | 'binary';
};

type ObservabilityConfig<TClaims = unknown, TLogScope = unknown> = {
  requestId?: boolean;
  logger?: Logger<TLogScope>;
  logScopeFactory?: (ctx: RequestContext, claims: TClaims | undefined) => TLogScope;
  maxCollect?: number; // default: 1024, max: 1048576 (1MB)
  formatMessage?: boolean; // default: true
  onRequest?: (ctx: RequestContext, app: HalideContext<TClaims, TLogScope>) => void | Promise<void>;
  onResponse?: (
    ctx: RequestContext,
    app: HalideContext<TClaims, TLogScope>,
    response: ResponseContext,
  ) => void | Promise<void>;
};
```
