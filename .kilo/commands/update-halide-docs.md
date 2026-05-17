---
description: Audit and update docs/ to match the current source code
agent: code
---

# Overview

Audit the `docs/` directory against the current source code and update documentation so it accurately reflects the library as it exists today.

The source code is the only source of truth. Existing documentation may be stale, incomplete, or incorrect.

Documentation should help a developer understand:
- what the library does
- how to configure it
- how to use its APIs
- runtime behavior and defaults
- validation rules and constraints
- integration patterns
- complete working examples

---

# Documentation Conventions

- Documentation lives under `docs/`
- Documentation files must use numbered prefixes:
  - `docs/0-*.md`
  - `docs/1-*.md`
  - etc.
- Preserve numbering order and reorganize numbering if necessary
- Create, merge, split, rename, or remove files as needed
- Prefer smaller focused documents over large monolithic files
- Keep examples minimal and accurate
- Preserve the existing writing style and tone where reasonable

The current file layout is only a starting point, not a required structure.

---

# Source Discovery

First, inspect the entire source tree to understand the current architecture and public API surface.

Pay special attention to:
- `src/index.ts`
- exported public APIs
- configuration types and defaults
- validation logic
- middleware
- route factories
- runtime behavior
- request/response lifecycle
- auth/security behavior
- observability hooks
- OpenAPI integration
- proxy behavior
- testing utilities
- helper utilities exposed publicly

Also inspect:
- `package.json`
- build configuration
- runtime requirements
- scripts
- README examples

Derive all documentation from the current implementation.

Do not assume existing docs are correct.

---

# Documentation Audit Process

For every docs file:

1. Verify all type signatures against source
2. Verify all defaults against runtime/config source
3. Verify all examples compile conceptually against the current API
4. Remove references to deleted APIs or behaviors
5. Add missing features or behaviors
6. Correct outdated terminology
7. Ensure cross-document consistency
8. Ensure imports and examples match the current public API

If an entire document is obsolete, remove it.

If important concepts are undocumented, create new numbered documents.

---

# API Reference Requirements

Generate API reference documentation directly from the current public exports.

Document:
- exported functions
- exported types
- configuration objects
- route factories
- handler signatures
- lifecycle hooks
- middleware configuration
- runtime return values

Do not document internal-only types unless they are important for understanding behavior.

---

# Behavior Documentation Requirements

Document actual runtime behavior, including:
- defaults
- validation rules
- middleware ordering
- auth behavior
- error behavior
- serialization behavior
- request parsing
- timeout behavior
- observability hooks
- OpenAPI generation behavior

Describe behavior as implemented today, not as described in existing docs.

---

# Examples

Ensure at least one complete end-to-end example exists and reflects current best practices.

Examples should:
- use current APIs
- use correct handler signatures
- use current configuration structure
- reflect current auth/security patterns
- reflect current middleware behavior

---

# Important Rules

- Prettier owns `.md` files — do not run Biome on markdown
- Source code overrides documentation whenever they conflict
- Remove undocumented historical behavior if it cannot be verified
- Prefer concise, developer-focused explanations
- Keep code examples accurate and minimal
- When uncertain, inspect implementation rather than inferring behavior
- This command updates consumer-facing Halide documentation distributed to downstream users
