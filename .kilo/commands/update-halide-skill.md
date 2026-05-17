---
description: Audit and update the Halide skill index and reference files from the current source code
agent: plan
output: markdown
---

# Purpose

Update `skill/SKILL.md` and `skill/references/*.md` so they accurately reflect the current Halide API and architecture.

The source code is the only source of truth.
Existing skill files and references may be stale or incomplete.

`SKILL.md` should remain concise and stable:
- navigation
- concept overview
- quick-start guidance
- links to detailed references

Detailed type definitions and implementation behavior belong in `skill/references/`.

---

# Source Discovery

Dynamically inspect the repository structure.

Do not rely on hardcoded module paths unless they are verified to exist.

Inspect:
- all non-test TypeScript source files
- public exports
- configuration types
- route factories
- middleware
- runtime composition
- validation logic
- OpenAPI integration
- observability hooks
- auth/security behavior
- proxy/runtime behavior

Also inspect:
- `docs/`
- `skill/references/`
- README examples
- package exports
- generated type declarations if present

Derive documentation structure from the current implementation.

---

# Reference Organization

The existing `skill/references/` structure is a starting point, not a required structure.

You may:
- create reference files
- merge files
- split files
- rename files
- remove obsolete files

Organize references around major framework concepts and runtime concerns.

Examples:
- configuration
- routes
- auth
- security
- observability
- OpenAPI
- runtime lifecycle
- proxy behavior
- testing utilities

Do not preserve outdated structure solely for compatibility.

---

# SKILL.md Requirements

Keep `skill/SKILL.md` concise (roughly 50-100 lines).

It should contain:

1. Frontmatter
2. Brief framework summary
3. Primary documentation index
4. Reference index
5. Minimal quick-start example
6. Minimal public API import example
7. Key behavioral gotchas
8. Fallback references to distributed typings/runtime files

Avoid duplicating detailed type definitions already covered in references.

SKILL.md should help an agent quickly determine:
- where information lives
- how the framework is organized
- which APIs are public
- which runtime behaviors are important

---

# Reference File Requirements

Reference files should be implementation-derived technical references.

For each reference:

1. Extract types from current source
2. Verify signatures against exports
3. Verify defaults against runtime/config source
4. Verify validation behavior
5. Include minimal examples
6. Remove undocumented historical behavior
7. Prefer concise reference-style formatting

Document:
- public interfaces
- exported types
- handler signatures
- configuration structures
- runtime behavior
- validation rules
- lifecycle hooks
- middleware behavior
- serialization behavior
- auth behavior
- proxy behavior
- OpenAPI behavior

Do not document implementation details that are irrelevant to consumers.

---

# API Surface Verification

Generate API references directly from the current public exports.

Do not manually preserve historical export lists.

Verify:
- exported functions
- exported types
- configuration objects
- runtime return values
- factory helpers
- middleware configuration
- lifecycle hooks

If source and existing references conflict, trust the source.

---

# Examples

Examples should:
- use current public APIs
- reflect current best practices
- avoid deprecated patterns
- remain minimal and focused
- conceptually compile against the current implementation

---

# Important Rules

- Treat existing documentation and references as potentially stale
- Source code overrides all existing docs
- Do not rely on hardcoded source module locations
- Prefer concept-based organization over implementation-based organization
- Keep SKILL.md concise and navigational
- Keep detailed technical information in references
- Remove obsolete behavior that cannot be verified
- Do not reference repository-internal source paths in consumer-facing docs
- Prefer npm-consumer perspective (`import from 'halide'`)
- This skill updates the consumer-facing Halide skill distributed to downstream agents
- When an agent lacks Halide knowledge, guide it to inspect `node_modules/halide`
  (the installed package) as a fallback source of truth for types, exports,
  and runtime behavior
