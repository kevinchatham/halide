---
description: Search through all project documentation and update it to match the current codebase state
agent: code
---

## Overview

This command audits all documentation files against the actual source code and updates them to reflect the current state of the project. It ensures docs stay accurate as the codebase evolves.

## Target Files

Update these documentation files:

- `README.md` — project overview, quick start, when not to use
- `docs/0-spa.md` — SPA hosting configuration
- `docs/1-api-routes.md` — API routes and validation
- `docs/2-proxy-routes.md` — proxy routes
- `docs/3-auth.md` — authentication and authorization
- `docs/4-security.md` — CORS, CSP, rate limiting
- `docs/5-observability.md` — logging and request lifecycle
- `docs/6-openapi.md` — OpenAPI documentation
- `docs/7-full-example.md` — complete working example
- `docs/8-api-reference.md` — exported API reference
- `skills/halide/SKILL.md` — agent skill documentation
- `AGENTS.md` — developer guide (update if source architecture changed)

## Steps

### Phase 1: Gather Source Truth

1. Read `src/index.ts` — identify all exported functions, types, and their signatures
2. Read `src/types.ts` — capture all type definitions, field names, and structures
3. Read `src/config/defaults.ts` — capture all default values
4. Read `src/config/validate.ts` — understand validation rules and error messages
5. Read `src/config/runtime.ts` — understand createServer/createApp behavior
6. Read `src/middleware/*.ts` — understand middleware behavior (auth, security, rate limit, etc.)
7. Read `src/routes/*.ts` — understand route registration and handling
8. Read `src/services/proxy.ts` — understand proxy behavior
9. Read `package.json` — check dependencies, scripts, engine requirements

### Phase 2: Identify Discrepancies

For each documentation file, compare against the source truth:

- **Type signatures**: Do exported types match what's documented? Check field names, required vs optional, default values
- **Code examples**: Do examples use current API? Check for deprecated patterns, missing fields, wrong field names
- **CSP directives**: Must use camelCase (`defaultSrc`) not kebab-case (`default-src`) — validation enforces this
- **OpenAPI**: Documentation uses Scalar (not Swagger UI). Check route meta format matches `OpenApiRouteMeta` type
- **Auth config**: Must be nested under `security.auth`, not top-level `auth`
- **Route factories**: `apiRoute()` and `proxyRoute()` are the preferred way — check examples use them
- **Handler signatures**: `(ctx, claims, logger)` — 3 params, ctx is plain object not Hono Context
- **Default values**: Port 3553, CORS origin `['*']`, rate limit opt-in, CSP always applied
- **API prefix**: `apiPrefix` defaults to `'/api'`, set to `''` to disable

### Phase 3: Update Documentation

For each file that has discrepancies:

1. Update code examples to use current API
2. Fix type names and signatures
3. Correct default values
4. Fix CSP examples to use camelCase
5. Update OpenAPI examples to match current `OpenApiRouteMeta` type (`responseSchema`, `responses` map)
6. Ensure all examples are self-consistent (e.g., full example uses same patterns as individual docs)
7. Update gotchas/common pitfalls sections
8. Verify tables and lists match actual exported types

### Phase 4: Verify Consistency

After updating:

1. Cross-reference all docs — ensure no contradictions between files
2. Check that `skills/halide/SKILL.md` contains the most complete reference (it's the agent's primary source)
3. Verify `README.md` quick start example works as-is
4. Ensure `docs/7-full-example.md` compiles mentally (all imports, types, and patterns are current)
5. Check `docs/8-api-reference.md` lists all exports from `src/index.ts`

### Phase 5: Update AGENTS.md if Needed

If the source architecture has changed (new directories, moved files, changed patterns):

1. Update the "Architecture" section to reflect current directory structure
2. Update "Gotchas" section with any new Biome rules or patterns
3. Update file path references if modules moved

## Important Rules

- **Biome owns `.md` files** — do NOT run Biome on `.md` files. Use Prettier only for formatting if needed
- Do NOT change the structure/organization of docs — only update content to match code
- Preserve existing documentation style and tone
- If a doc section describes something that no longer exists, remove it (don't leave stale references)
- If new source features exist that aren't documented, add them to the appropriate doc file
- Keep code examples minimal and focused — don't add unnecessary complexity
- When in doubt about whether something changed, check git history for the source file
