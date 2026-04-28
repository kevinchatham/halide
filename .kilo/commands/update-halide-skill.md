---
description: Research the Halide source code and update skills/halide/SKILL.md to accurately reflect the current API
agent: code
output: markdown
---

## Purpose

This command deeply researches the Halide workspace library source code and updates `skills/halide/SKILL.md` so it serves as an accurate, comprehensive skill for driving a consuming agent that uses Halide as an installed library (e.g., from `node_modules/halide`).

## Steps

### Phase 1: Gather Source Truth

Dynamically discover all source files — do NOT rely on hardcoded paths. The source tree may change over time.

1. Use glob to find all `src/**/*.ts` files, then filter out `*.spec.ts` test files
2. Read `src/index.ts` first to identify all public exports
3. Follow the export graph — read every file that `src/index.ts` imports from (directly or transitively)
4. Read `package.json` — dependencies, engines, exports
5. If a file referenced by an export cannot be found, note it as a gap in the skill output

### Phase 2: Write the Skill

Write `skills/halide/SKILL.md` with these sections:

1. **Frontmatter** — `name: halide`, `description:` concise summary
2. **Overview** — what Halide is, when to use it
3. **Quick Start** — minimal working example using `createServer`
4. **Exports** — all imports from `'halide'` (functions + types)
5. **ServerConfig** — complete type breakdown with all fields, defaults, required vs optional
6. **API Routes** — `apiRoute()` factory, handler signature, validation, OpenAPI metadata
7. **Proxy Routes** — `proxyRoute()` factory, path rewriting, identity, transform, timeout
8. **Auth** — bearer and JWKS strategies, audience validation
9. **Authorization** — `authorize` functions, `access` field
10. **Security** — CORS, CSP (camelCase!), rate limiting
11. **App** — static serving, apiPrefix, fallback, root optional for pure backend mode
12. **Observability** — logger, requestId, onRequest/onResponse hooks, per-route observe
13. **OpenAPI** — Scalar UI, per-route metadata, response schemas
14. **createApp** — testing/custom server usage
15. **Gotchas** — common pitfalls, validation errors, framework choice
16. **Fallback** — instruct consuming agents to read `node_modules/halide/dist/index.js` and `node_modules/halide/dist/index.d.ts` as a last resort for type information

### Phase 3: Verify

1. Confirm all exported types from `src/index.ts` are documented
2. Confirm all default values match the source (locate defaults via the config module discovered in Phase 1)
3. Confirm handler signatures match actual implementation
4. Confirm code examples are self-consistent and use current API
5. Confirm CSP examples use camelCase
6. Confirm auth config is nested under `security.auth`
7. Confirm the skill is written from a consumer's perspective (as if halide is installed via npm)

## Rules

- Write the skill from the perspective of a consuming developer whose project has `halide` installed
- Do NOT reference internal source file paths in the skill — use `node_modules/halide` as the fallback reference
- Keep code examples minimal and focused
- Use the `apiRoute()` and `proxyRoute()` factories in all examples (not raw route objects)
- Mark required fields clearly
- Include default values for all optional fields
- The skill should be comprehensive enough that an agent can build a Halide server without needing to read source code
