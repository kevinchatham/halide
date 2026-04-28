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

### Phase 2: Write the Skill

Write `skill/SKILL.md` as a concise index (~50-100 lines):

1. **Frontmatter** — `name: halide`, concise `description`
2. **Primary Resources table** — map topics to `docs/*.md` files
3. **Detailed References table** — map topics to `skill/references/*.md`
4. **Complete Type Reference** — minimal import snippet showing all exports from `'halide'`
5. **Minimal Example** — 10-line working example using `createServer` + `apiRoute`
6. **Key Gotchas** — 5-6 bullet points (camelCase CSP, wildcard origin/credentials, private routes need auth, etc.)
7. **Fallback Reference** — point to `node_modules/halide/dist/index.d.ts` and `node_modules/halide/dist/index.js`

### Phase 3: Verify

1. Confirm `skill/SKILL.md` is under 100 lines
2. Confirm all major topics have corresponding docs/references files
3. Confirm exports in the type reference match `src/index.ts`
4. Confirm gotchas are accurate based on validation rules

## Rules

- Keep SKILL.md as an index, not a comprehensive guide
- Point to existing `docs/` and `skill/references/` files rather than duplicating
- Code examples should be minimal (under 15 lines each)
- Write from a consuming agent's perspective (halide installed via npm)
- Do NOT reference internal source file paths — use `node_modules/halide` as fallback
