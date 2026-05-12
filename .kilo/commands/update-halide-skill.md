---
description: Research the Halide source code and update skills/halide/SKILL.md to accurately reflect the current API
agent: code
output: markdown
---

## Purpose

This command updates `skill/SKILL.md` as a concise index pointing to existing documentation and reference files, rather than duplicating everything.

## Steps

### Phase 1: Gather Source Truth

Dynamically discover source files — do NOT rely on hardcoded paths.

1. Use glob to find all `src/**/*.ts` files, filter out `*.spec.ts` test files
2. Read `src/index.ts` to identify public exports
3. Verify the `docs/` directory has files for each major topic
4. Verify the `skill/references/` directory has reference files for detailed type info
5. Map each reference file to its corresponding source modules:
   - `skill/references/config.md` ← `src/config/types.ts`, `src/config/defaults.ts`
   - `skill/references/routes.md` ← `src/routes/apiRoute.ts`, `src/routes/proxyRoute.ts`
   - `skill/references/auth.md` ← `src/middleware/auth.ts`
   - `skill/references/security.md` ← `src/middleware/csp.ts`, `src/middleware/cors.ts`
   - `skill/references/openapi.md` ← `src/middleware/openapi.ts`
   - `skill/references/observability.md` ← `src/middleware/observability.ts`

### Phase 2: Write the Skill

Write `skill/SKILL.md` as a concise index (~50-100 lines):

1. **Frontmatter** — `name: halide`, concise `description`
2. **Primary Resources table** — map topics to `docs/*.md` files
3. **Detailed References table** — map topics to `skill/references/*.md`
4. **Complete Type Reference** — minimal import snippet showing all exports from `'halide'`
5. **Minimal Example** — 10-line working example using `createServer` + `apiRoute`
6. **Key Gotchas** — 5-6 bullet points (camelCase CSP, wildcard origin/credentials, private routes need auth, etc.)
7. **Fallback Reference** — point to `node_modules/halide/dist/index.d.ts` and `node_modules/halide/dist/index.js`

### Phase 3: Update Reference Files

For each reference file, read the corresponding source modules and update the reference with accurate type definitions, interfaces, and examples derived from the current source code.

**config.md** — Extract from `src/config/types.ts`:
- `ServerConfig` interface (note: uses separate `apiRoutes` and `proxyRoutes` arrays)
- `THalideApp` type (claims + logger bundle)
- `AppConfig` interface (root, port, fallback, apiPrefix)
- `SecurityConfig` interface
- All other config types (CorsConfig, CspOptions, etc.)

**routes.md** — Extract from `src/routes/apiRoute.ts` and `src/routes/proxyRoute.ts`:
- `apiRoute()` factory signature with `access`, `path`, `method`, `handler`, `requestSchema`
- `proxyRoute()` factory signature with `access`, `path`, `methods`, `target`, `proxyPath`, `timeout`, `identity`, `transform`
- Handler signatures: `(ctx, app) => Promise<unknown>` where `ctx` is plain object, `app` is `THalideApp`
- Path rewriting rules for proxy routes (especially wildcard `/*` handling)
- Headers stripped from proxied requests

**auth.md** — Extract from `src/middleware/auth.ts`:
- Bearer strategy config (secret, secretTtl, audience)
- JWKS strategy config (jwksUri, audience)
- Auth middleware behavior (how claims are extracted and validated)
- Error responses for missing/invalid auth

**security.md** — Extract from `src/middleware/csp.ts` and `src/middleware/cors.ts`:
- CSP directives (camelCase keys, e.g., `defaultSrc` not `default-src`)
- CORS config (origin, methods, credentials, headers)
- Validation rules (wildcard origin + credentials is forbidden)
- SecurityConfig composition

**openapi.md** — Extract from `src/middleware/openapi.ts`:
- OpenApiConfig interface (enabled, path, options)
- OpenApiRouteMeta per-route metadata
- Scalar UI integration
- Default disabled — warn when enabled in production

**observability.md** — Extract from `src/middleware/observability.ts`:
- ObservabilityConfig interface (logger, requestId, onRequest, onResponse)
- Logger interface (`{ debug, error, info, warn }`)
- Lifecycle hooks (onRequest, onResponse per route)
- `observe: false` to skip hooks per route

### Phase 4: Verify

1. Confirm `skill/SKILL.md` is under 100 lines
2. Confirm all major topics have corresponding docs/references files
3. Confirm exports in the type reference match `src/index.ts`
4. Confirm gotchas are accurate based on validation rules
5. Confirm each reference file reflects current source code (types, interfaces, examples match)

## Rules

- Keep SKILL.md as an index, not a comprehensive guide
- Point to existing `docs/` and `skill/references/` files rather than duplicating
- Code examples should be minimal (under 15 lines each)
- Write from a consuming agent's perspective (halide installed via npm)
- Do NOT reference internal source file paths — use `node_modules/halide` as fallback
- Reference files must reflect actual source code types/interfaces — do not hardcode stale definitions
- When source and reference conflict, trust the source — update the reference to match
