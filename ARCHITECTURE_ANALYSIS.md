# Halide Critical Architecture Analysis

## 1. Architecture Strengths

**Zod-based declarative validation.** The config layer uses Zod schemas with `superRefine` for cross-field validation (`src/config/schema.ts`). This captures constraints like "wildcard origin + credentials: true" and "private routes require auth" at parse time, providing structured error messages with dot-notation paths.

**Factory pattern for route definitions.** `apiRoute()` and `proxyRoute()` (`src/routes/apiRoute.ts`, `src/routes/proxyRoute.ts`) fill in `type` and default `authorize` to `defaultAuthorize`. This keeps route definitions concise while ensuring internal consistency.

**Claim extractor caching.** The `ClaimExtractorCache` with `MAX_EXTRACTOR_CACHE` limit (`src/routes/registry.auth.ts:21-43`) prevents recreating claim extractors per request. The `createSecretCache` utility with `pendingPromise` deduplication (`src/utils/secretCache.ts:45`) prevents thundering herd on secret refresh.

**JWKS middleware caching with background refresh.** The JWKS cache (`src/middleware/auth.ts:101-149`) uses a 10-minute sweep timer and a background refresh at half-life (30 minutes), reducing latency spikes from JWKS endpoint fetches.

**Proxy body streaming with observability.** The `collectProxyBody` function (`src/routes/proxy-body.ts`) uses `response.body.tee()` to pipe the response to the client while collecting up to `maxCollect` bytes (default 1024) for observability. This avoids buffering entire responses.

**Graceful shutdown.** `createServer` (`src/config/runtime.ts:243-265`) implements proper shutdown: disposes proxy/rate-limit resources, drains active connections with a polling loop, and handles SIGINT/SIGTERM.

**Redis-backed rate limiting.** The `RedisClient` interface (`src/middleware/rateLimit.ts:8-15`) provides a distributed rate limiting path for multi-instance deployments.

## 2. Design Weaknesses

<!-- **Massive `createApp` function — single responsibility violation.** `src/config/runtime.ts:63-188` is 125 lines doing: validation, Hono instantiation, CORS setup, CSRF setup, rate limiting, OpenAPI CSP, regular CSP, request ID, route registration, OpenAPI routes, static file serving, and error handling. This is a factory that builds a complete server in one function. Every new feature requires modifying this function. -->

<!-- **Config layer leaks implementation details.** `ServerConfig` (`src/types/server-config.ts`) exposes `observability`, `openapi`, and `app` at the top level alongside `apiRoutes` and `proxyRoutes`. Consumers of `node_modules/halide` must understand framework internals (like `logScopeFactory`, `maxCollect`, Scalar UI config) to use the library. The `ObservabilityConfig.onRequest` and `onResponse` hooks pass `HalideContext` which contains `claims` and `logger` — consumers are coupling to the framework's internal context shape. -->

<!-- **`createSecurityMiddleware` returns `ReturnType<typeof secureHeaders>` without explicit typing.** The return type in `src/middleware/security.ts:19` is a type alias to the Hono secure-headers return type. This is a brittle dependency — if `hono/secure-headers` changes its return type, the middleware contract changes silently. -->

<!-- **`parseJsonBody` swallows the original error.** `src/utils/parseJsonBody.ts:21` catches any error from `c.req.json()` and throws `BodyParseError` with a generic message. The original stack trace and error context are lost, making debugging malformed JSON in production difficult. -->

<!-- **`buildDescribeRouteOptions` mutates `options` object before returning.** `src/routes/registry.openapi.ts:96-107` creates `options: DescribeRouteOptions = {}` then assigns properties directly. This is fine but the function has no return type annotation — it relies on inference, which is fragile if `DescribeRouteOptions` changes. -->

<!-- **`isOptionalSchema` uses internal Zod API.** `src/routes/registry.openapi.ts:16-19` checks `s._def?.typeName === 'ZodOptional'` which relies on Zod's internal structure. This is explicitly noted in the comment but represents a breaking change risk on any Zod minor version. -->

<!-- **`createApp` has fire-and-forget async validation.** `src/config/runtime.ts:72-81` calls `validateServerConfig(config)` in a `void` promise chain when a function-based secret is present. Validation failures are silently swallowed — the server starts even if the config is invalid, and errors only appear in logs. -->

<!-- **`defineHalide` is a pass-through wrapper with no value-add.** `src/config/builder.ts` wraps `apiRoute`, `proxyRoute`, `createApp`, and `createServer` and re-exports them with identical signatures. The only value is generic pre-baking for `TClaims` and `TLogScope`, but the wrapper adds indirection without type safety improvements. -->

<!-- **`registry.auth.ts` has 334 lines for auth-related concerns.** The file contains `ClaimExtractorCache`, `createClaimExtractor`, `extractClaims`, `checkAuthorization`, `emitOnRequest`, `emitOnResponse`, `createAuthMiddleware`, and internal interfaces. This is a multi-responsibility module that should be split. -->

## 3. Security Concerns

<!-- **`defaultAuthorize` permits all requests.** `src/config/defaults.ts:75-78` returns `true` unconditionally. Any route with `access: 'private'` but no explicit `authorize` function is effectively public. The validation checks that `security.auth` exists for private routes, but does not require an `authorize` function — a consumer could configure bearer auth and forget to add authorization, thinking they're protected when they're not. -->

<!-- **CORS defaults are permissive.** `src/config/defaults.ts:23` sets `origin: []` (empty array). Hono's CORS with an empty origin array means no `Access-Control-Allow-Origin` header is sent, which is safe. However, the default `methods` include `'delete'` and `'patch'` — destructive operations are allowed by default for cross-origin requests. -->

<!-- **CSF is applied globally but OpenAPI routes get relaxed CSP.** `src/config/runtime.ts:148-157` applies `DEFAULTS.csp.openapiOverrides` to Swagger routes, which includes `'unsafe-inline'` for `scriptSrc` and `styleSrc`. This weakens CSP for the entire Swagger path. If a consumer enables OpenAPI in production (against the warning), they get significantly weaker CSP without realizing it. -->

<!-- **`x-forwarded-for` forwarding requires explicit `trustedProxies`.** While this is documented, the default `DEFAULT_FORWARD_HEADERS` in `src/services/proxy.ts:144-152` omits `x-forwarded-for` entirely. A consumer who wants to pass client identity upstream must configure both `forwardHeaders: ['x-forwarded-for']` AND `trustedProxies`. This two-step configuration is easy to miss. -->

<!-- **Rate limit uses in-memory store by default.** The default rate limiter (`src/middleware/rateLimit.ts:153-199`) uses a `Map` with LRU eviction. This means each server instance tracks rate limits independently. In a multi-instance deployment behind a load balancer, a client can send `N * instances` requests before being rate-limited, where `N` is `maxRequests`. -->

<!-- **`BodyParseError` exposes generic error messages.** `src/utils/parseJsonBody.ts:22` returns `'Invalid JSON in request body'` for all JSON parse failures. This doesn't distinguish between malformed JSON, oversized payloads, or encoding errors — all surface as 400 with the same message, providing no diagnostic value. -->

<!-- **JWKS cache only supports RS256.** `src/middleware/auth.ts:88` hardcodes `alg: ['RS256']` when creating JWKS middleware. There is no configuration option for other algorithms (ES256, PS256, EdDSA). This is a security limitation — if an identity provider uses non-RS256 keys, JWKS auth will fail silently. -->

**Audit log reveals sensitive data in error scope.** `src/middleware/errorHandler.ts:40-43` passes the `factoryScope` (which could contain `claims` data like user email, roles, or tokens) into error logs. If an error occurs and `logScopeFactory` produces a scope with sensitive claims data, that data appears in error logs.

**`probe()` validates TLS but doesn't validate upstream certificates.** `src/services/proxy.ts:72` uses `rejectUnauthorized: true` for TLS probes, which is correct. However, the actual proxy requests in `createProxyService` (`src/services/proxy.ts:460-466`) create a `new Request()` with an `http.Agent` — the agent's keep-alive connections reuse the TLS session from the probe, but the proxy request itself doesn't perform certificate validation independently.

**`crypto.randomUUID()` for request IDs.** `src/middleware/requestId.ts:10` uses `crypto.randomUUID()` which is acceptable for request correlation but provides no cryptographic guarantee of uniqueness across distributed instances. In a distributed system, two instances could theoretically generate the same ID.

## 4. Scalability Risks

<!-- **In-memory rate limiter loses state on restart.** The `Map`-based store (`src/middleware/rateLimit.ts:117-142`) is ephemeral. On process restart, all rate limit counters reset to zero. For burst protection, this means a malicious client can trigger a restart (via memory pressure or OOM) and get a fresh rate limit window. -->

**Claim extractor cache has no TTL.** `src/routes/registry.auth.ts:21-43` uses a FIFO eviction at `MAX_EXTRACTOR_CACHE` (200) but never expires entries. If auth config changes (e.g., secret rotation), the stale extractor remains cached until all slots are evicted through new config changes. This is a 200-request window for stale auth configuration.

**JWKS cache has no size limit enforcement on refresh.** `src/middleware/auth.ts:80-98` deletes the cache entry before fetching, but `jwkFetchLocks` and `jwkRefreshLocks` have `MAX_JWK_LOCKS = 100` limits with FIFO eviction. If 100 different JWKS URIs are fetching concurrently, new fetches for existing URIs will get evicted locks and create duplicate fetches.

**HTTP agent pool uses FIFO eviction with connection destruction.** `src/services/proxy.ts:21-27` evicts the oldest agent and calls `agent.destroy()` which closes all keep-alive connections. This causes a burst of reconnections for the evicted host, potentially overwhelming the upstream server.

**No request queue or backpressure mechanism.** The framework forwards requests directly to upstream servers via `hono/proxy`. There is no request queue, circuit breaker, or backpressure. If an upstream server slows down, all worker threads are occupied waiting for responses, eventually causing the Node.js event loop to stall.

**Proxy body collection buffers in memory.** `src/routes/proxy-body.ts:26-50` collects response body chunks into a `Uint8Array[]` array up to `maxCollect` bytes. For responses larger than `maxCollect`, the array is truncated but all collected chunks are held in memory. With `maxCollect = 1024` (default), this is bounded, but the `Blob` conversion at line 59 copies the data again.

**`activeRequests` Set grows unbounded.** `src/config/runtime.ts:233` tracks `ServerResponse` objects in a `Set`. This is bounded by concurrent connections, but there is no maximum. Under a DDoS, this Set grows proportionally to the attack size.

**OpenAPI spec resolution blocks on first request.** `src/middleware/openapi.ts:188-197` resolves external specs on the first request to `/swagger/openapi.json`. If multiple requests arrive simultaneously, `state.specResolution` is set and subsequent requests await it — this is correct. However, if resolution fails, `state.cachedSpec = {}` is set and all subsequent requests get an empty spec without retry.

**`createAgentCache` creates new `http.Agent` per target.** Each unique target URL gets a new `http.Agent` with its own connection pool. With `MAX_AGENT_CACHE = 500`, this means up to 500 agents with 50 sockets each = 25,000 concurrent connections. This is significant but bounded.

## 5. Maintainability Issues

<!-- **Split middleware concern in `createApp`.** CORS, CSRF, CSP, rate limiting, request ID, and route registration are all in `createApp`. Adding a new middleware requires editing this function and understanding the exact ordering. The middleware ordering is: CORS → CSRF → rate limit → OpenAPI CSP → CSP → request ID → routes → OpenAPI routes → static files → error handler. Any change to this order requires re-reading the entire function. -->

<!-- **Config validation is split between Zod and imperative code.** `src/config/schema.ts` uses Zod for structural validation, but cross-field rules (port range, proxy target URL, method requirements) are in `superRefine`. The `validate.ts` file adds additional imperative checks (async secret validation, algorithm warnings). This hybrid approach makes it hard to understand all validation rules without reading both files. -->

**`asInternalLogger` type cast is a code smell.** `src/config/defaults.ts:172-174` casts `Logger<T>` to `Logger<Record<string, unknown>>`. This bypasses type safety and means internal logger calls can log arbitrary shapes that the consumer's `TLogScope` type doesn't expect. The cast is necessary because internal logging doesn't fit the consumer's scope type, but it indicates the Logger interface is not flexible enough.

**Test utilities don't mock middleware.** `src/test-utils/index.ts:21-29` creates a test app by calling `registerRoutes` and `createOpenApiRoutes` directly, bypassing `createApp`. This means tests don't exercise CORS, CSP, rate limiting, or CSRF middleware — they test routes in isolation but not the full middleware pipeline.

**CLI couples to project structure assumptions.** `src/cli/commands/init.ts` assumes the project has `tsconfig.json` and `tsconfig.app.json` files. The `excludeServerFromApp` function (`src/cli/commands/init.template.ts:83-102`) creates `tsconfig.app.json` with `exclude: ['server.ts']` if it doesn't exist, which may conflict with frameworks that use different exclude patterns.

**`registry.auth.ts` mixes auth and observability.** The file contains `emitOnRequest` and `emitOnResponse` functions (observability concerns) alongside `extractClaims` and `checkAuthorization` (auth concerns). This coupling means auth changes require understanding observability hooks and vice versa.

**Constants are scattered across multiple files.** `src/config/constants.ts` defines `JWKS_CACHE_TTL_MS`, `MAX_JWK_CACHE`, `MAX_AGENT_CACHE`, etc. But `src/middleware/rateLimit.ts:5` redefines `DEFAULT_MAX_ENTRIES = 10_000` which duplicates `src/config/constants.ts:17`. Constants should be centralized.

**`createAuthMiddleware` has 30 lines of scope creation logic.** `src/routes/registry.auth.ts:311-333` creates scoped loggers, builds `HalideContext`, and stores variables on the Hono context. This is framework machinery that every route handler must understand implicitly.

**Proxy path rewriting uses string replacement.** `src/services/proxy.ts:434-436` replaces `:key` patterns in `proxyPath` using `String.replace()`. This is fragile — if a route parameter name appears as a substring of another word in the path, it gets replaced incorrectly. Hono's path parser handles this, but the manual replacement doesn't.

## 6. Recommendations

**1. Extract middleware pipeline into composable builder.** Replace the monolithic `createApp` with a middleware pipeline builder that accepts ordered middleware configurations. This would let consumers add/replace middleware without understanding the internal ordering. Priority: High.

**2. Require explicit `authorize` for private routes.** Change validation to reject routes with `access: 'private'` and no `authorize` function. The current `defaultAuthorize` (always `true`) creates a false sense of security. Priority: High.

**3. Add circuit breaker to proxy routes.** Implement a circuit breaker pattern (`src/services/proxy.ts`) that tracks upstream failure rates and stops forwarding to unhealthy targets. This prevents cascading failures when upstream servers are degraded. Priority: High.

**4. Centralize all constants.** Move all magic numbers from `src/middleware/rateLimit.ts`, `src/config/constants.ts`, and inline values into a single `src/config/constants.ts` file. Remove the duplicate `DEFAULT_MAX_ENTRIES`. Priority: Medium.

**5. Add TTL to claim extractor cache.** The `ClaimExtractorCache` should evict entries after a configurable time, not just on size. This ensures auth config changes propagate promptly. Priority: Medium.

**6. Split `registry.auth.ts` into auth and observability modules.** Move `emitOnRequest`, `emitOnResponse`, and `EmitConfig` interfaces to a separate `registry.observability.ts` file. This separates auth logic from hook emission logic. Priority: Medium.

**7. Replace `void` promise validation with awaited validation.** `src/config/runtime.ts:72-81` fire-and-forgets async validation. Either await it before returning `CreateAppResult` or expose a `validationPromise` property so consumers can handle failures. Priority: Medium.

**8. Add structured error codes to `BodyParseError`.** Extend `BodyParseError` with a `code` property ('MALFORMED_JSON', 'OVERSIZED_BODY', 'ENCODING_ERROR') to provide diagnostic value. Priority: Low.

**9. Add `maxCollect` config validation.** The `maxCollect` option in `ObservabilityConfig` has no upper bound. Add a validation constraint (e.g., maximum 10KB) to prevent excessive memory usage from response body collection. Priority: Low.

**10. Document middleware ordering explicitly.** Add a comment block at the top of `createApp` documenting the exact middleware ordering and the reason for each position. This reduces the cognitive load when modifying the pipeline. Priority: Low.
