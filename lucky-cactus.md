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

---

## Target Consumer API

```typescript
// 1. Define your types once
interface UserClaims  { sub: string; role: 'admin' | 'user'; }
interface LogScope    { requestId: string; userId?: string; }

// 2a. Standalone — explicit params on each call
const route = apiRoute<UserClaims, LogScope, { name: string }, { id: string }>({ ... });
const server = createServer<UserClaims, LogScope>({ apiRoutes: [route] });

// 2b. Builder — define TClaims/TLogScope once, only body types per route   [see open question]
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

- Remove `AnyHalideContext` (or keep as unexported internal alias if still needed in registry).
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
  apiRoutes?: ApiRoute<TClaims, TLogScope, any, any>[];  // ← 'any' is the variance fix
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

// AFTER
function createApp<TClaims = unknown, TLogScope = unknown>(config: ServerConfig<TClaims, TLogScope>): CreateAppResult
function createServer<TClaims = unknown, TLogScope = unknown>(config: ServerConfig<TClaims, TLogScope>): Server
```

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

## Phase 2 — Fix `apiRoutes` Array Variance Bug

The root cause: `ApiRouteHandler<_, _, TBody, _>` is **contravariant** in `TBody` because `TBody` appears in the
`ctx` parameter. TypeScript's `strictFunctionTypes` means `ApiRoute<App, CreateUserSchema>` is not assignable to
`ApiRoute<App, unknown>`.

The fix is to use `any` on the `TBody`/`TResponse` slots in the `ServerConfig.apiRoutes` array. The type safety
guarantee at the array level is exactly what Zod provides at runtime — the schema validates the body. TypeScript
enforces the match between handler and schema **at route-definition time** (inside `apiRoute()`). There is nothing
more to enforce at the server-config level.

```typescript
// In ServerConfig
apiRoutes?: ApiRoute<TClaims, TLogScope, any, any>[];
```

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
These changes are mechanical — replace extraction helpers with direct parameters.

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

## Phase 4 — Clean Up `Route` Union Type

The `Route<TApp, TBody, TResponse>` union is asymmetric: `ProxyRoute` has no `TBody`/`TResponse`, so those params
are misleading on the union. Simplify:

```typescript
// BEFORE
type Route<TApp = HalideContext, TBody = unknown, TResponse = unknown> =
  | ApiRoute<TApp, TBody, TResponse>
  | ProxyRoute<TApp>;

// AFTER
type Route<TClaims = unknown, TLogScope = unknown> =
  | ApiRoute<TClaims, TLogScope, any, any>
  | ProxyRoute<TClaims, TLogScope>;
```

---

## Phase 5 — Update Public API Exports (`src/index.ts`)

**Remove from exports:**
- `AnyHalideContext`
- `AppClaims`
- `AppLogger`
- `AppLogScope`
- `RegisterRoutesOptions` (internal)

**Keep or add:**
- `HalideContext<TClaims, TLogScope>` — still useful as the named handler context type
- All other existing exports, updated signatures only

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

Export from `src/index.ts`. Usage:

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

- `src/demo.ts` — Rewrite to use the new API. Remove `as unknown as ApiRoute<DemoApp>` cast.
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
| `src/types/api.ts` | Split all generics to `TClaims, TLogScope`; update all 6 types |
| `src/types/server-config.ts` | Split to `TClaims, TLogScope`; use `any` for body in `apiRoutes[]` |
| `src/config/runtime.ts` | Remove `AnyHalideContext` constraint; split params |
| `src/config/defaults.ts` | Update `defaultAuthorize` type |
| `src/config/builder.ts` | **New file** — `defineHalide` builder (Phase 6 only) |
| `src/routes/apiRoute.ts` | Split to 4 params |
| `src/routes/proxyRoute.ts` | Split to 2 params; align default with `apiRoute` |
| `src/routes/registry.ts` | Split `RegisterRoutesOptions` |
| `src/routes/registry.api.ts` | Replace `AppClaims/AppLogger/AppLogScope` usages |
| `src/routes/registry.auth.ts` | Simplify `createClaimExtractor`, `createAuthMiddleware`; fix logScopeFactory call |
| `src/routes/registry.proxy.ts` | Remove `AnyHalideContext` constraint; split params |
| `src/middleware/errorHandler.ts` | Update `logScopeFactory` signature |
| `src/index.ts` | Remove old exports; optionally add `defineHalide` |
| `src/demo.ts` | Rewrite with new API; remove cast |
| `src/*.spec.ts` (all) | Update type params throughout |

---

## Breaking Changes Summary

| Area | Before | After |
|------|--------|-------|
| `ServerConfig` | `ServerConfig<TApp>` | `ServerConfig<TClaims, TLogScope>` |
| `ApiRoute` | `ApiRoute<TApp, TBody, TRes>` | `ApiRoute<TClaims, TLogScope, TBody, TRes>` |
| `ProxyRoute` | `ProxyRoute<TApp>` | `ProxyRoute<TClaims, TLogScope>` |
| `AuthorizeFn` | `AuthorizeFn<TApp>` | `AuthorizeFn<TClaims, TLogScope>` |
| `ObservabilityConfig` | `ObservabilityConfig<TApp>` | `ObservabilityConfig<TClaims, TLogScope>` |
| `createServer` | `createServer<TApp extends AnyHalideContext>` | `createServer<TClaims, TLogScope>` |
| `logScopeFactory` signature | `(ctx, app: TApp) => TLogScope` | `(ctx, claims: TClaims \| undefined) => TLogScope` |
| `AnyHalideContext` | exported | removed |
| `AppClaims`, `AppLogger`, `AppLogScope` | exported | removed |

---

## Decision Log

**defineHalide builder:** Included (Phase 6). The `defineHalide<TClaims, TLogScope>()` builder is part of the implementation scope. Standalone functions remain for consumers who prefer explicit params.
