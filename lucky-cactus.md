# Plan: Simplify Halide Type Ergonomics

## Goal

Replace the single `TApp` bundle parameter with explicit `TClaims` and `TLogScope` parameters throughout, fix the `apiRoutes` array variance bug that forces consumers into unsafe casts, and clean up the public API surface. All three consumer priorities are addressed:

1. **Type-safe request/response bodies on API routes** — fixed by changing the `apiRoutes` array element type.
2. **Typed logger scope** — surfaced directly as `TLogScope`, no bundle type required.
3. **Typed JWT claims** — surfaced directly as `TClaims`, no bundle type required.

---

## The Core Problem (Current State)

The `TApp` bundle pattern compresses two independent concerns into a single type parameter and then uses `AnyHalideContext` to work around the contravariance that creates. The downstream consequence is that `ServerConfig.apiRoutes` must be typed as `ApiRoute<TApp, unknown, unknown>[]`, which makes `ApiRoute<DemoApp, CreateUserSchema>` not assignable to the array — the consumer is forced into a cast:

```typescript
// Currently required in the official demo
apiRoutes: [route as unknown as ApiRoute<DemoApp>]
```

**Variance root cause:** `ApiRoute.handler` is a function-valued property (`handler: ApiRouteHandler<...>`). With `strictFunctionTypes`, function-valued properties are contravariant, so handler types with different `TBody` are incompatible. The fix (Phase 2) uses a **method declaration** for `handler`, since TypeScript checks method parameters bivariantly, allowing mixed body types in the array without `any`.

**Variance root cause:** `ApiRoute.handler` is a function-valued property (`handler: ApiRouteHandler<...>`). With `strictFunctionTypes`, function-valued properties are contravariant, so handler types with different `TBody` are incompatible. The fix (Phase 2) uses a **method declaration** for `handler`, since TypeScript checks method parameters bivariantly, allowing mixed body types in the array without `any`.

---

## Target Consumer API

```typescript
// 1. Define your types once
interface UserClaims  { sub: string; role: 'admin' | 'user'; }
interface LogScope    { requestId: string; userId?: string; }

// 2. Builder — define TClaims/TLogScope once, only body types per route
const { apiRoute, proxyRoute, createServer } = defineHalide<UserClaims, LogScope>();
const route = apiRoute<{ name: string }, { id: string }>({ ... });
const server = createServer({ apiRoutes: [route] });

// 3. Handler receives fully typed context — no manual type casting ever
handler: async (ctx, { claims, logger }) => {
  // ctx.body: { name: string }        ← typed request body
  // claims: UserClaims | undefined    ← typed JWT claims
  // logger: Logger<LogScope>          ← typed log scope
  return { id: crypto.randomUUID() };
}

// 4. logScopeFactory — cleaner signature, receives only what it needs
logScopeFactory: (ctx, claims) => ({
  requestId: ctx.headers['x-request-id'] as string ?? '',
  userId: claims?.sub,
})
```

---

## What Is Removed From the Public API

| Removed Export           | Reason |
|--------------------------|--------|
| `AnyHalideContext`       | Implementation detail; contravariance workaround no longer needed |
| `AppClaims<TApp>`        | Replaced by direct `TClaims` |
| `AppLogger<TApp>`        | Replaced by `Logger<TLogScope>` |
| `AppLogScope<TApp>`      | Replaced by direct `TLogScope` |
| `RegisterRoutesOptions`  | Internal type; not useful to library consumers |
| `Route<TApp,TBody,TRes>` | Asymmetric union; TBody/TResponse removed (see Phase 4) |

**Kept as exported utility type:** `HalideContext<TClaims, TLogScope>` — useful as the named type of the `app` parameter in handlers, now an output type rather than an input type parameter.

---

## Phase 1 — Split `TApp` Into `TClaims + TLogScope` Throughout

### `src/types/app.ts`

- Remove `AnyHalideContext` entirely (no longer needed — not even internally).
- Remove `AppClaims<TApp>`, `AppLogger<TApp>`, `AppLogScope<TApp>`.
- Update `ObservabilityConfig`:

```typescript
// BEFORE
type ObservabilityConfig<TApp = HalideContext> = {
  logger?: AppLogger<TApp>;
  logScopeFactory?: (ctx: RequestContext, app: TApp) => AppLogScope<TApp>;
  onRequest?: (ctx: RequestContext, app: TApp) => void | Promise<void>;
  onResponse?: (ctx: RequestContext, app: TApp, response: ResponseContext) => void | Promise<void>;
};

// AFTER
type ObservabilityConfig<TClaims = unknown, TLogScope = unknown> = {
  logger?: Logger<TLogScope>;
  logScopeFactory?: (ctx: RequestContext, claims: TClaims | undefined) => TLogScope;
  onRequest?: (ctx: RequestContext, app: HalideContext<TClaims, TLogScope>) => void | Promise<void>;
  onResponse?: (ctx: RequestContext, app: HalideContext<TClaims, TLogScope>, response: ResponseContext) => void | Promise<void>;
  requestId?: boolean;
  maxCollect?: number;
};
```

The `logScopeFactory` signature change is important: the current `(ctx, app: TApp) => scope` signature passes a
"preliminary app context" (the factory's own output hasn't been computed yet, so logger is unscoped). The new
`(ctx, claims)` signature passes only what the factory legitimately needs and removes the circular dependency.

### `src/types/api.ts`

```typescript
// BEFORE
type ApiRoute<TApp, TBody, TResponse>
type ApiRouteHandler<TApp, TBody, TResponse>
type ApiRouteInput<TApp, TBody, TResponse>
type AuthorizeFn<TApp>
type ProxyRoute<TApp>
type ProxyRouteInput<TApp>

// AFTER
type ApiRoute<TClaims, TLogScope, TBody, TResponse>
type ApiRouteHandler<TClaims, TLogScope, TBody, TResponse>
type ApiRouteInput<TClaims, TLogScope, TBody, TResponse>
type AuthorizeFn<TClaims, TLogScope>
type ProxyRoute<TClaims, TLogScope>
type ProxyRouteInput<TClaims, TLogScope>
```

The handler's `app` parameter type becomes `HalideContext<TClaims, TLogScope>` directly (no extraction needed).

### `src/types/server-config.ts`

```typescript
// BEFORE
type ServerConfig<TApp = HalideContext> = {
  apiRoutes?: ApiRoute<TApp, unknown, unknown>[];
  proxyRoutes?: ProxyRoute<TApp>[];
  observability?: ObservabilityConfig<TApp>;
  ...
};

// AFTER
type ServerConfig<TClaims = unknown, TLogScope = unknown> = {
  apiRoutes?: ApiRoute<TClaims, TLogScope, unknown, unknown>[];  // method handler → bivariant
  proxyRoutes?: ProxyRoute<TClaims, TLogScope>[];
  observability?: ObservabilityConfig<TClaims, TLogScope>;
  ...
};
```

### `src/routes/apiRoute.ts`

```typescript
// BEFORE
function apiRoute<TApp, TBody = unknown, TResponse = unknown>(
  route: ApiRouteInput<TApp, TBody, TResponse>
): ApiRoute<TApp, TBody, TResponse>

// AFTER
function apiRoute<TClaims = unknown, TLogScope = unknown, TBody = unknown, TResponse = unknown>(
  route: ApiRouteInput<TClaims, TLogScope, TBody, TResponse>
): ApiRoute<TClaims, TLogScope, TBody, TResponse>
```

### `src/routes/proxyRoute.ts`

```typescript
// BEFORE
function proxyRoute<TApp = unknown>(route: ProxyRouteInput<TApp>): ProxyRoute<TApp>

// AFTER
function proxyRoute<TClaims = unknown, TLogScope = unknown>(
  route: ProxyRouteInput<TClaims, TLogScope>
): ProxyRoute<TClaims, TLogScope>
```

### `src/config/runtime.ts`

```typescript
// BEFORE
function createApp<TApp extends AnyHalideContext = HalideContext>(config: ServerConfig<TApp>): CreateAppResult
function createServer<TApp extends AnyHalideContext = HalideContext>(config: ServerConfig<TApp>): Server

// AFTER — no constraint, no casts
function createApp<TClaims = unknown, TLogScope = unknown>(config: ServerConfig<TClaims, TLogScope>): CreateAppResult
function createServer<TClaims = unknown, TLogScope = unknown>(config: ServerConfig<TClaims, TLogScope>): Server
```

Additionally, eliminate all casts in the implementation:
- `{ errors: result.errors } as unknown as AppLogScope<TApp>` → plain `{ errors: result.errors }`
- `logger as AppLogger<TApp>` → pass `logger` directly
- `configInput as ServerConfig<HalideContext>` (for openapi pass-through) → just pass or use `HalideContext<TClaims, TLogScope>`
- `createErrorHandler<unknown, TApp>(logger, logScopeFactory)` → `createErrorHandler<TClaims, TLogScope>(...)`

The `extends AnyHalideContext` constraint is removed. No constraint is needed because `TClaims` and `TLogScope` are
unconstrained type parameters.

### `src/config/defaults.ts`

```typescript
// BEFORE
const defaultAuthorize: AuthorizeFn<unknown> = async (_ctx, _app) => true;

// AFTER
const defaultAuthorize: AuthorizeFn<unknown, unknown> = async (_ctx, _app) => true;
```

---

## Phase 2 — Fix `apiRoutes` Array Variance Bug (Method Declaration)

The root cause: `ApiRoute.handler` is a **function-valued property** (`handler: ApiRouteHandler<...>`). With
`strictFunctionTypes`, function-valued properties are contravariant in their parameter types. This means
`ApiRoute<..., CreateUserSchema, ...>` is not assignable to `ApiRoute<..., unknown, ...>` because `CreateUserSchema`
appears in a function parameter position.

**Fix:** Change `handler` from a function-valued property to a **method declaration**. TypeScript checks method
parameters bivariantly (even with `strictFunctionTypes`), so `ApiRoute<..., CreateUserSchema>` becomes assignable
to `ApiRoute<..., unknown>` without `any`.

**Why not make `ApiRouteInput.handler` a method too?** Consumer-facing type safety. At route-definition time,
`ApiRouteInput` preserves the strict function-valued `ApiRouteHandler` — if a handler's body type doesn't match
the route's declared schema, TypeScript catches it at the definition site. At array-assembly time, the method
declaration on `ApiRoute` alone provides the bivariance needed for mixed-body arrays. Making both method
declarations would lose definition-time schema validation entirely, forcing runtime tests to catch mismatches.

```typescript
// BEFORE — function-valued property (contravariant)
type ApiRoute<TClaims, TLogScope, TBody, TResponse> = {
  handler: ApiRouteHandler<TClaims, TLogScope, TBody, TResponse>;
};

// AFTER — method declaration (bivariant)
type ApiRoute<TClaims, TLogScope, TBody, TResponse> = {
  handler(ctx: RequestContext & { body: TBody }, app: HalideContext<TClaims, TLogScope>): Promise<TResponse | Response>;
};
```

Type safety at route-definition time is preserved because `ApiRouteInput` overrides `handler` back to the strict
function-valued `ApiRouteHandler` type — contravariance only applies at definition time, not at array-assembly time.

The `ServerConfig.apiRoutes` array keeps `ApiRoute<TClaims, TLogScope, unknown, unknown>[]` — no `any` needed.

With this change, the demo becomes:

```typescript
// BEFORE: required cast
apiRoutes: [profileRoute, userRoute as unknown as ApiRoute<DemoApp>, healthRoute]

// AFTER: no cast
apiRoutes: [profileRoute, userRoute, healthRoute]
```

---

## Phase 3 — Update Internal Registration Code

All internal files that reference `TApp`, `AppClaims<TApp>`, `AppLogger<TApp>`, `AppLogScope<TApp>` need updating.
These changes are mechanical — replace extraction helpers with direct `TClaims, TLogScope` parameters.

### `src/routes/registry.ts`

```typescript
// BEFORE
type RegisterRoutesOptions<TApp extends AnyHalideContext = HalideContext> = {
  config: ServerConfig<TApp>;
  logger: AppLogger<TApp>;
  ...
};

// AFTER
type RegisterRoutesOptions<TClaims = unknown, TLogScope = unknown> = {
  config: ServerConfig<TClaims, TLogScope>;
  logger: Logger<TLogScope>;
  ...
};
```

### `src/routes/registry.auth.ts`

Key simplification: the `logScopeFactory` signature change eliminates the "preliminary app context" hack:

```typescript
// BEFORE — builds a fake TApp just to pass to logScopeFactory
const preliminaryAppCtx = { claims, logger } as TApp;
const scope = logScopeFactory(reqCtx, preliminaryAppCtx);

// AFTER — passes claims directly
const scope = logScopeFactory(reqCtx, claims);
```

The `createClaimExtractor` and `createAuthMiddleware` functions are updated to use `TClaims, TLogScope` directly
instead of extracting from `TApp`.

### `src/routes/registry.api.ts` and `src/routes/registry.proxy.ts`

Replace all `TApp extends AnyHalideContext` constraints with `TClaims, TLogScope` and remove all `AppClaims<TApp>`,
`AppLogger<TApp>`, `AppLogScope<TApp>` usages.

### `src/routes/registry.openapi.ts`

Functions `buildDescribeRouteOptions`, `buildRequestBody`, `buildResponses` use `<TApp>` generics (for passing to
`ApiRoute<TApp>` / `ProxyRoute<TApp>`). Update to `<TClaims, TLogScope>`.

### `src/routes/registry.body.ts`

`createApiBodyParser` and `createProxyBodyParser` use `<TApp = HalideContext>`. Update to
`<TClaims = unknown, TLogScope = unknown>`.

### `src/routes/registry.auth.ts`

Key simplifications:

1. **logScopeFactory signature change** eliminates the "preliminary app context" hack:

```typescript
// BEFORE — builds a fake TApp just to pass to logScopeFactory
const preliminaryAppCtx = { claims, logger } as TApp;
const scope = logScopeFactory(reqCtx, preliminaryAppCtx);

// AFTER — passes claims directly
const scope = logScopeFactory(reqCtx, claims);
```

2. **`createScopedLogger` cast eliminated:**
```typescript
// BEFORE
scopedLogger = createScopedLogger(logger, scope) as AppLogger<TApp>;

// AFTER
scopedLogger = createScopedLogger(logger, scope);
```

3. **`EmitConfig<TApp>` and `ResponseEmitConfig<TApp>`** — split to `TClaims, TLogScope`.

### `src/middleware/openapi.ts`

`createOpenApiRoutes` uses `<TApp extends HalideContext = HalideContext>`. Switch to
`<TClaims = unknown, TLogScope = unknown>` — use `HalideContext<TClaims, TLogScope>` as the struct type, not as
a constraint.

### `src/services/proxy.ts`

`applyIdentityHeaders`, `applyTransform`, `createProxyService` use `<TApp extends AnyHalideContext>`. Update
all to `<TClaims, TLogScope>` with `HalideContext<TClaims, TLogScope>`.

### `src/middleware/errorHandler.ts`

```typescript
// BEFORE
function createErrorHandler<TLogScope = unknown, TApp = unknown>(
  logger: Logger<TLogScope>,
  logScopeFactory?: (ctx: RequestContext, app: TApp) => TLogScope,
)

// AFTER
function createErrorHandler<TClaims = unknown, TLogScope = unknown>(
  logger: Logger<TLogScope>,
  logScopeFactory?: (ctx: RequestContext, claims: TClaims | undefined) => TLogScope,
)
```

---

## Phase 4 — Remove `Route` Union Type

The `Route<TApp, TBody, TResponse>` union is asymmetric (ProxyRoute has no body/response params) and is dead code —
zero internal imports. Remove it entirely from `src/types/api.ts` and `src/index.ts`.

---

## Phase 5 — Update Public API Exports (`src/index.ts`)

**Remove from exports:**
- `AnyHalideContext`
- `AppClaims`
- `AppLogger`
- `AppLogScope`
- `RegisterRoutesOptions` (internal)
- `Route` (dead code — removed entirely)

**Keep or add:**
- `HalideContext<TClaims, TLogScope>` — still useful as the named handler context type
- `defineHalide` — new builder factory (from Phase 6); this is the **primary consumer-facing API**
- All other existing exports, updated signatures only

**Not exported (internal only):**
- `apiRoute` — only accessible via `defineHalide().apiRoute`
- `proxyRoute` — only accessible via `defineHalide().proxyRoute`
- `createApp` — only accessible via `defineHalide().createApp`
- `createServer` — only accessible via `defineHalide().createServer`

---

## Phase 6 — Add `defineHalide` Builder

A thin factory that pre-bakes `TClaims` and `TLogScope` so callers only specify body types per route. No new
runtime logic — purely a type ergonomics wrapper.

### New file: `src/config/builder.ts`

```typescript
export function defineHalide<TClaims = unknown, TLogScope = unknown>() {
  return {
    apiRoute: <TBody = unknown, TResponse = unknown>(
      route: ApiRouteInput<TClaims, TLogScope, TBody, TResponse>,
    ): ApiRoute<TClaims, TLogScope, TBody, TResponse> =>
      apiRoute<TClaims, TLogScope, TBody, TResponse>(route),

    proxyRoute: (route: ProxyRouteInput<TClaims, TLogScope>): ProxyRoute<TClaims, TLogScope> =>
      proxyRoute<TClaims, TLogScope>(route),

    createApp: (config: ServerConfig<TClaims, TLogScope>): CreateAppResult =>
      createApp<TClaims, TLogScope>(config),

    createServer: (config: ServerConfig<TClaims, TLogScope>): Server =>
      createServer<TClaims, TLogScope>(config),
  };
}
```

Export from `src/index.ts`. This is the **primary consumer-facing API** — standalone `apiRoute`, `proxyRoute`, `createApp`, and `createServer` exist as internal implementation only (not exported). Usage:

```typescript
const { apiRoute, proxyRoute, createServer } = defineHalide<UserClaims, LogScope>();

const server = createServer({
  apiRoutes: [
    apiRoute<{ name: string }, { id: string }>({ ... }),  // 2 params, not 4
    apiRoute({ access: 'public', ...  }),                  // 0 params if no body
  ],
  proxyRoutes: [proxyRoute({ ... })],                       // 0 params
});
```

---

## Phase 7 — Update Tests, Demo, and Spec Files

- `src/demo.ts` — Rewrite to use the builder API. Remove `as unknown as ApiRoute<DemoApp>` cast.
- `src/routes/apiRoute.spec.ts` — Update test with `apiRoute<UserClaims, LogScope, Body, Response>`.
- `src/routes/registry.spec.ts` — Update `RegisterRoutesOptions` type usage.
- `src/routes/registry.auth.spec.ts` — Update claim extractor tests.
- `src/config/runtime.spec.ts` — Update `createApp`/`createServer` type params.
- All other `*.spec.ts` files that reference `TApp`, `HalideContext`, `AppClaims`, etc.

---

## File Change Summary

| File | Change Type |
|------|-------------|
| `src/types/app.ts` | Remove `AnyHalideContext`, `AppClaims`, `AppLogger`, `AppLogScope`; update `ObservabilityConfig` |
| `src/types/api.ts` | Split all generics to `TClaims, TLogScope`; update `ApiRoute`, `ApiRouteHandler`, `ApiRouteInput`, `AuthorizeFn`, `ProxyRoute`, `ProxyRouteInput`; convert `handler` to method declaration; remove `Route` union |
| `src/types/server-config.ts` | Split to `TClaims, TLogScope`; `apiRoutes[]` stays `unknown` (method fixes variance) |
| `src/config/runtime.ts` | Remove `AnyHalideContext` constraint; split params; eliminate all casts |
| `src/config/defaults.ts` | Update `defaultAuthorize` type |
| `src/config/builder.ts` | **New file** — `defineHalide` builder (Phase 6) |
| `src/routes/apiRoute.ts` | Split to 4 params; no runtime changes |
| `src/routes/proxyRoute.ts` | Split to 2 params; align default with `apiRoute` |
| `src/routes/registry.ts` | Split `RegisterRoutesOptions` |
| `src/routes/registry.api.ts` | Replace `AppClaims/AppLogger/AppLogScope` usages; split generics |
| `src/routes/registry.auth.ts` | Split `EmitConfig`/`ResponseEmitConfig`; fix logScopeFactory call; remove preliminary app context hack; remove cast on `createScopedLogger` |
| `src/routes/registry.proxy.ts` | Remove `AnyHalideContext` constraint; split params |
| `src/routes/registry.openapi.ts` | Update `buildDescribeRouteOptions`, `buildRequestBody`, `buildResponses` generics |
| `src/routes/registry.body.ts` | Update `createApiBodyParser`, `createProxyBodyParser` generics |
| `src/middleware/openapi.ts` | Update `createOpenApiRoutes` generics |
| `src/middleware/errorHandler.ts` | Update `logScopeFactory` signature |
| `src/services/proxy.ts` | Update `applyIdentityHeaders`, `applyTransform`, `createProxyService` generics |
| `src/index.ts` | Remove old exports (`AnyHalideContext`, `AppClaims`, `AppLogger`, `AppLogScope`, `Route`, `RegisterRoutesOptions`); keep `apiRoute`/`proxyRoute`/`createApp`/`createServer` as internal-only (not exported); add `defineHalide` as primary export |
| `src/demo.ts` | Rewrite with builder API; remove cast |
| `src/*.spec.ts` (all) | Update type params throughout |

---

## Breaking Changes Summary

| Area | Before | After |
|------|--------|-------|
| `ServerConfig` | `ServerConfig<TApp>` | `ServerConfig<TClaims, TLogScope>` |
| `ApiRoute` | `ApiRoute<TApp, TBody, TRes>` (handler: function prop) | `ApiRoute<TClaims, TLogScope, TBody, TRes>` (handler: method — bivariant) |
| `Route` | exported union type | removed entirely |
| `ProxyRoute` | `ProxyRoute<TApp>` | `ProxyRoute<TClaims, TLogScope>` |
| `AuthorizeFn` | `AuthorizeFn<TApp>` | `AuthorizeFn<TClaims, TLogScope>` |
| `ObservabilityConfig` | `ObservabilityConfig<TApp>` | `ObservabilityConfig<TClaims, TLogScope>` |
| `createServer` | `createServer<TApp extends AnyHalideContext>` | `createServer<TClaims, TLogScope>` |
| `logScopeFactory` signature | `(ctx, app: TApp) => TLogScope` | `(ctx, claims: TClaims \| undefined) => TLogScope` |
| `AnyHalideContext` | exported | removed |
| `AppClaims`, `AppLogger`, `AppLogScope` | exported | removed |

---

## Decision Log

- **defineHalide builder:** Builder-only (Phase 6). `defineHalide<TClaims, TLogScope>()` is the primary consumer-facing API. Standalone `apiRoute`/`proxyRoute`/`createApp`/`createServer` exist as internal implementation only (not publicly exported).
- **logScopeFactory:** Changed from `(ctx, app)` to `(ctx, claims)` — removes the preliminary-app-context hack.
- **Variance fix:** Method declaration on `ApiRoute.handler` (not `any`). TypeScript checks method parameters bivariantly, so `ApiRoute<..., CreateUserSchema>` is assignable to `ApiRoute<..., unknown>`. `ApiRouteInput.handler` remains a strict function-valued `ApiRouteHandler` for type safety at route-definition time.
- **Route union:** Removed entirely (dead code — zero internal imports).
- **HalideContext:** Not used as an internal constraint. All internal code uses `TClaims, TLogScope` directly. `HalideContext` remains exported as a convenience type.
- **Casts:** Eliminate all casts in implementation (`runtime.ts`, `registry.auth.ts`, etc.) — no `as unknown as AppLogScope<TApp>`, no `as AppLogger<TApp>`, no preliminary-app-context hack.
