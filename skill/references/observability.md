# Observability

## Configuration

```typescript
type MyLogScope = { requestId: string; service: string };

observability: {
  requestId: true,              // generates/forwards x-request-id headers
  logger: {
    debug: (scope, ...args) => myLogger.debug(scope, ...args),
    error: (scope, ...args) => myLogger.error(scope, ...args),
    info: (scope, ...args) => myLogger.info(scope, ...args),
    warn: (scope, ...args) => myLogger.warn(scope, ...args),
  },
  logScopeFactory: (ctx, app) => ({ requestId: ctx.path }),  // optional — per-request scope
  maxCollect: 1024,             // optional — max bytes to collect from proxy responses
  onRequest: (ctx, app) => { app.logger.info(ctx, `${ctx.method} ${ctx.path}`); },
  onResponse: (ctx, app, response) => { app.logger.info(ctx, `${ctx.method} ${ctx.path} ${response.statusCode}`); },
}
```

## Default Logger

If no logger is provided, a styled default logger is used via `createDefaultLogger()`:

- Colored, level-prefixed messages in TTY output (`[INFO]`, `[ERROR]`, `[WARN]`, `[DEBUG]`)
- Plain text (`[LEVEL] message`) when output is not a TTY
- Use `createNoopLogger()` for silent output

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

## Log Scope Factory

The `logScopeFactory` produces a typed scope object for each request. The scope is automatically baked into every logger call via `createScopedLogger`, eliminating the need to manually pass scope in every `logger.info(scope, ...)` call.

```typescript
logScopeFactory: (ctx, app) => ({
  requestId: ctx.path,
  userId: app.claims?.sub ?? undefined,
}),
```

## Lifecycle Hooks

- `onRequest(ctx, app)` — called before each route handler
- `onResponse(ctx, app, response)` — called after each response is sent (including on error)

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

type ObservabilityConfig<TApp = HalideContext> = {
  requestId?: boolean;
  logger?: AppLogger<TApp>;
  logScopeFactory?: (ctx: RequestContext, app: TApp) => AppLogScope<TApp>;
  maxCollect?: number; // default: 1024
  onRequest?: (ctx: RequestContext, app: TApp) => void | Promise<void>;
  onResponse?: (ctx: RequestContext, app: TApp, response: ResponseContext) => void | Promise<void>;
};
```
