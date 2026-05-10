---
description: Review the Halide project architecture and produce a critical analysis
agent: code
output: markdown
---

## Purpose

Review the Halide source code and produce a critical architecture analysis. Identify design weaknesses, potential risks, coupling issues, and areas for improvement. Do not document — critique.

## Phase 1: Discover Source Files

1. Use glob to find all `src/**/*.ts` files, filter out `*.spec.ts` test files
2. List each directory under `src/` to confirm module organization
3. Read `src/index.ts` to identify all public exports and re-exports
4. Check `package.json` for dependencies, scripts, engine requirements

## Phase 2: Analyze Config Layer

Read ALL files in `src/config/`:

- `src/config/types.ts` — all type definitions and interfaces
- `src/config/defaults.ts` — all default values
- `src/config/validate.ts` — validation rules and error messages
- `src/config/runtime.ts` — server lifecycle, `createServer`/`createApp` behavior

Critique:
- Are type definitions minimal and focused, or bloated with unrelated concerns?
- Is validation imperative and hard to maintain? Consider declarative alternatives.
- Are defaults sensible or do they hide configuration mistakes?
- Is `ServerConfig` too permissive — what constraints are missing?
- Does the config layer leak implementation details into the public API?

## Phase 3: Analyze Middleware Layer

Read ALL files in `src/middleware/`:

- Auth middleware — bearer (via `hono/jwt`) and JWKS (via `hono/jwk`)
- CORS middleware — config, validation rules
- CSP middleware — camelCase directive keys, defaults
- Rate limit middleware — in-memory store, window size, IP extraction
- Request ID middleware — header generation/forwarding
- Error handler middleware — error format
- OpenAPI middleware — Scalar UI integration, per-route metadata

Critique:
- Is middleware ordering correct and secure? Are there ordering-dependent bugs?
- Does auth flow have race conditions (e.g., secret caching with `secretTtl`)?
- Are security defaults actually secure, or do they expose common attack surfaces?
- Is the in-memory rate limiter sufficient for production, or does it lose state on restart?
- Are middleware concerns properly separated, or is there cross-cutting duplication?

## Phase 4: Analyze Routes Layer

Read ALL files in `src/routes/`:

- `apiRoute.ts` — factory function, handler signature, validation
- `proxyRoute.ts` — factory function, path rewriting, identity, transform
- `registry.ts` — route registration pattern
- `app.ts` — static file serving, fallback behavior

Critique:
- Are `apiRoute()` and `proxyRoute()` factories too opinionated? Do they hide important configuration?
- Is the handler signature `(ctx, claims, logger)` ergonomic or awkward? Is `ctx` as a plain object a problem?
- Does `proxyRoute`'s `identity` and `transform` create hidden side effects?
- Is the registry pattern scalable, or does it become unwieldy with many routes?
- Are error paths well-defined, or do failures in proxy routes silently degrade?

## Phase 5: Analyze Services & Utils

- `src/services/proxy.ts` — proxy handler, path rewriting logic, timeout handling
- `src/utils/secretCache.ts` — JWT secret caching, TTL behavior

Critique:
- Does the proxy handler have memory leaks or unbounded buffering?
- Are timeouts properly propagated to the upstream server?
- Is the secret cache thread-safe (given Node.js single-threaded, is this even a concern)?
- Are cache invalidation strategies sound, or could stale secrets cause auth failures?

## Phase 6: Analyze CLI

- `src/cli/` — CLI commands (e.g., `npx halide init`)

Critique:
- Is the CLI a thin wrapper around the library, or does it couple CLI concerns to core logic?
- Are CLI commands testable and deterministic?

## Phase 7: Cross-Reference & Verify

Cross-check findings against `AGENTS.md` and known patterns:

- Factory functions (`apiRoute`, `proxyRoute`) fill in `type` and default `authorize`
- CSP directives use camelCase (`defaultSrc`), not kebab-case (`default-src`)
- `apiPrefix` defaults to `'/api'` — set `''` to disable
- `createApp` builds without starting; `createServer` adds lifecycle
- OpenAPI UI disabled by default; warns when enabled in production
- `observability.onRequest`/`onResponse` hooks fire per-route; `observe: false` skips them

Critique:
- Are these conventions documented or enforced at compile time?
- Do the conventions prevent real mistakes, or just surface-level ones?
- Is there technical debt accumulating in the gap between documented and actual behavior?

## Output Format

Write the analysis with these sections:

1. **Architecture Strengths** — what works well, why
2. **Design Weaknesses** — specific problems with code-level examples
3. **Security Concerns** — auth, CORS, CSP, rate limiting gaps
4. **Scalability Risks** — what breaks at scale (memory, concurrency, state)
5. **Maintainability Issues** — coupling, testability, config complexity
6. **Recommendations** — prioritized improvements with rationale

## Rules

- Be critical and specific — name files, functions, patterns
- Support every claim with evidence from the code
- Distinguish between "good enough" and "production-ready"
- If something is unclear from the code, note it as ambiguity
- Use imperative code style (no "Great", "Sure", etc.)
- Do NOT reference internal source file paths in output — use `node_modules/halide` as the consuming perspective
