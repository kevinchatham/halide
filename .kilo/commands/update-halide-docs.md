---
description: Audit and update docs/ files to match the current codebase state
agent: code
---

## Overview

This command audits the `docs/` directory against the actual source code and updates documentation to reflect the current state of the Halide library. The goal is comprehensive, accurate library documentation that a developer can read to learn how to use Halide.

## Target Files

Documentation lives in `docs/`. The files below are the starting point — create or remove files as the codebase requires:

- `docs/0-app.md` — App hosting configuration (root optional for pure backend, port, fallback, apiPrefix)
- `docs/1-api-routes.md` — API routes, handler signatures, body validation
- `docs/2-proxy-routes.md` — proxy routes, path rewriting, identity, transform
- `docs/3-auth.md` — authentication (bearer/JWKS) and authorization (authorize fn)
- `docs/4-security.md` — CORS, CSP (camelCase directives), rate limiting
- `docs/5-observability.md` — logging, request IDs, onRequest/onResponse hooks
- `docs/6-openapi.md` — OpenAPI/Scalar documentation, per-route metadata
- `docs/7-full-example.md` — complete working example
- `docs/8-api-reference.md` — all exported functions and types from index.ts

Also update if source architecture changed:
- `README.md` — project overview, quick start, when not to use
- `skills/halide/SKILL.md` — agent skill documentation
- `AGENTS.md` — developer guide

## Steps

### Phase 1: Gather Source Truth

Read these source files to establish what is actually exported and how it works:

1. `src/index.ts` — all exported functions and types (the public API surface)
2. `src/types.ts` — all type definitions, field names, required vs optional, defaults
3. `src/config/defaults.ts` — all default values (port 3553, CSP defaults, rate limit defaults, etc.)
4. `src/config/validate.ts` — validation rules and error messages (what the config validator enforces)
5. `src/config/runtime.ts` — createServer/createApp behavior, middleware ordering, server lifecycle
6. `src/middleware/*.ts` — auth (bearer via hono/jwt, JWKS via hono/jwk), security (CSP via hono/secure-headers), rate limit, request ID, error handler, OpenAPI (Scalar via @scalar/hono-api-reference)
7. `src/routes/*.ts` — apiRoute/proxyRoute factories, registry (route registration), SPA handler
8. `src/services/proxy.ts` — proxy behavior (path rewriting, identity headers, transform, timeout)
9. `package.json` — dependencies, scripts, engine requirements (Node.js >= 24.0.0, ESM)

### Phase 2: Verify Each Doc File and Identify Gaps

First, scan all source files under `src/` to identify concepts that may lack documentation. Then for each existing file in `docs/`, verify against source truth:

#### docs/0-app.md
- `app.root` is optional — server can run as pure backend when omitted
- `apiPrefix` defaults to `'/api'`, set to `''` to disable
- Port resolution: `PORT` env → `app.port` → default `3553`
- `fallback` defaults to `'index.html'`
- `name` defaults to `'app'` (used in log output)

#### docs/1-api-routes.md
- Handler signature: `(ctx: RequestContext & { body: TBody }, claims: TClaims | undefined, logger: Logger) => Promise<unknown>`
- `ctx` is a **plain object**, NOT a Hono Context
- `method` defaults to `'get'`
- `validationSchema` is a Zod schema — body validated before handler runs
- `apiRoute()` factory fills in `type: 'api'` and default `authorize`
- Supported methods: `'get' | 'post' | 'put' | 'patch' | 'delete'`
- Return value is JSON-serialized via `c.json(result)`
- For routes without `validationSchema`, body is parsed from JSON for POST/PUT/PATCH

#### docs/2-proxy-routes.md
- `methods` array is **required** (unlike apiRoute's optional `method`)
- `proxyPath` defaults to `path` if omitted — path prefix rewriting
- `timeout` defaults to `60000` (60 seconds), uses `AbortSignal.timeout()`
- `identity(ctx, claims)` — only called when claims is defined (private routes with successful auth)
- `transform({ body, headers })` — body is JSON-stringified, headers normalized to lowercase
- Without transform, raw request body is forwarded as-is
- `proxyRoute()` factory fills in `type: 'proxy'` and default `authorize`

#### docs/3-auth.md
- Auth configured under `security.auth` (NOT top-level `auth`)
- Bearer strategy: uses `hono/jwt` `verify()` with HS256, `secret` can be sync or async function
- JWKS strategy: uses `hono/jwk` middleware with RS256
- `audience` is optional — validates `aud` claim (supports string or array)
- Failed auth → `401 Unauthorized` with `{ error: 'Unauthorized' }`
- If any route has `access: 'private'`, `security.auth` must be configured (validator throws)
- `authorize` function: `(ctx, claims, logger) => boolean | Promise<boolean>`, failed → `403 Forbidden`

#### docs/4-security.md
- CORS: defaults `origin: ['*']`, `credentials: false`, `methods: ['get', 'post', 'put', 'delete', 'patch']`
- CORS wildcard origin cannot combine with `credentials: true` (validator throws)
- CSP: always applied via `hono/secure-headers`, defaults to restrictive policy
- CSP directive keys must be **camelCase** (`defaultSrc`), NOT kebab-case (`default-src`) — validator throws
- Rate limiting: opt-in, IP-based sliding window, defaults 100 requests per 15 minutes
- Rate limit client IP from `x-forwarded-for` (first value) or `'unknown'`
- Returns `429` with `Retry-After` header when exceeded

#### docs/5-observability.md
- `requestId: true` generates/forwards `x-request-id` headers
- Logger defaults to no-op if omitted
- `onRequest(ctx, claims, logger)` — called after auth/authorization, before handler
- `onResponse(ctx, claims, response, logger)` — response has `{ statusCode, durationMs, error? }`
- Per-route: `observe: false` skips onRequest/onResponse hooks
- `ResponseContext` type exists in types.ts but is NOT exported from index.ts

#### docs/6-openapi.md
- Uses Scalar UI (`@scalar/hono-api-reference`), NOT Swagger UI
- Default path: `'/swagger'`
- `observe: false` hides route from OpenAPI docs
- `openapi.responseSchema` — Zod schema for 200 response
- `openapi.responses` — alternative: map of status codes to `{ description, schema? }`
- Zod schemas from `validationSchema` and `responseSchema` auto-converted to JSON Schema

#### docs/7-full-example.md
- Must compile mentally — all imports, types, patterns current
- Uses `apiRoute()` and `proxyRoute()` factories
- CSP directives use camelCase
- Auth config nested under `security.auth`
- Handler signatures correct (3 params, ctx is plain object)

#### docs/8-api-reference.md
- Must list ALL exports from `src/index.ts`:
  - Functions: `createServer`, `createApp`, `apiRoute`, `proxyRoute`
  - Types: `ServerConfig`, `Server`, `CreateAppResult`, `ApiRoute`, `ApiRouteHandler`, `ProxyRoute`, `AuthorizeFn`, `TransformFn`, `RequestContext`, `SecurityConfig`, `SecurityAuthConfig`, `CorsConfig`, `CspOptions`, `CspDirectives`, `AppConfig`, `ObservabilityConfig`, `OpenApiConfig`, `OpenApiRouteMeta`, `Logger`, `ClaimExtractor`
- `createServer` is synchronous (no await)
- `createApp` returns `{ app, rateLimitDispose }` — useful for testing

### Phase 3: Update and Reorganize Documentation

For each file with discrepancies:

1. Fix type signatures to match `src/types.ts` exactly
2. Update code examples to use current API (factory functions, correct field names)
3. Correct default values from `src/config/defaults.ts`
4. Fix CSP examples to use camelCase directive names
5. Update validation rules to match `src/config/validate.ts`
6. Ensure OpenAPI examples match `OpenApiRouteMeta` type (`responseSchema`, `responses` map)
7. Update handler signatures — `(ctx, claims, logger)` with ctx as plain object
8. Add documentation for any source features not yet documented
9. Remove documentation for features that no longer exist

For undocumented source concepts:

1. Create new `docs/N-topic.md` files with appropriate numbered prefix
2. Follow the same style and tone as existing docs
3. Include code examples, type signatures, and default values

For obsolete doc files:

1. If an entire doc file describes concepts that no longer exist in the codebase, remove it
2. If a concept moved to a different file, update references and remove the old file

### Phase 4: Cross-Reference Consistency

1. Ensure no contradictions between doc files
2. Verify `docs/7-full-example.md` uses patterns consistent with individual docs
3. Verify `docs/8-api-reference.md` matches `src/index.ts` exports exactly
4. Check that `README.md` quick start example works as-is
5. Ensure `skills/halide/SKILL.md` contains the most complete reference

### Phase 5: Update AGENTS.md if Needed

If source architecture changed (new directories, moved files, changed patterns):

1. Update "Architecture" section with current directory structure
2. Update "Gotchas" section with any new Biome rules or patterns
3. Update file path references if modules moved

## Important Rules

- **Prettier owns `.md` files** — do NOT run Biome on `.md` files
- Preserve existing documentation style and tone
- If an entire doc file describes concepts that no longer exist in the codebase, remove the file
- If entire concepts exist in the source that have no documentation, create new files in `docs/` to cover them
- Use numbered prefixes for new files to maintain ordering (e.g. `docs/9-cli.md`)
- If new source features exist that aren't documented, add them to the appropriate doc file or create a new one
- Keep code examples minimal and focused
- When in doubt, check git history for the source file
- Write docs from a developer's perspective — how would someone learn to use this library?
