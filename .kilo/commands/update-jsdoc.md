---

description: Scan source files and add/update JSDoc comments on public APIs and internal symbols
agent: plan
---

# Purpose

Add or update JSDoc throughout the codebase to accurately describe the current implementation.

The source code is the only source of truth.
Existing JSDoc may be stale, incomplete, inconsistent, or incorrect.

The goal is:

* comprehensive JSDoc for public APIs
* lightweight orientation comments for internal helpers
* accurate descriptions derived from implementation
* improved editor discoverability and API readability

Only modify documentation comments.
Do not change code logic, types, exports, formatting rules, or runtime behavior.

---

# Source Discovery

Dynamically inspect all TypeScript source files.

Do not rely on hardcoded paths beyond the source root.

Inspect:

* all `.ts` files under `src/`
* exclude all test/spec files
* public entrypoints and package exports
* exported symbols
* internal helpers
* configuration defaults
* type definitions
* implementation behavior
* usage relationships between symbols

Build an understanding of:

* public API surface
* internal architectural roles
* symbol relationships
* default values
* runtime semantics

Derive JSDoc from implementation, not existing comments.

---

# Documentation Scope

## Public API (full JSDoc)

Apply comprehensive JSDoc to exported symbols, including:

* exported functions
* exported constants
* exported classes
* exported interfaces
* exported type aliases
* exported enums
* exported namespace members
* properties of exported interfaces and object types
* function parameters
* generic type parameters
* return values

Include:

* summary description
* implementation-relevant details
* `@typeParam`
* `@param`
* `@returns`
* `@example` where especially useful
* `{@link}` references when helpful
* documented defaults where behavior provides them

---

## Internal Symbols (minimal JSDoc)

Apply lightweight single-line JSDoc to important internal symbols, including:

* internal helper functions
* internal constants
* internal types
* internal interfaces
* internal utility classes

Purpose:

* orient future maintainers
* clarify helper responsibilities
* improve scan readability

Do not add full parameter or return annotations for internal symbols unless necessary.

---

## Exclusions

Do not add JSDoc to:

* test/spec files
* re-export statements
* trivial one-line assignments whose names are fully self-explanatory
* anonymous inline type literals
* generated code
* comments unrelated to symbol declarations

Do not document implementation noise.

Prefer signal over comment volume.

---

# JSDoc Requirements

## Exported Types and Interfaces

Document:

* what the type represents
* where it is used
* important invariants
* behavioral implications
* relationships to related types

For complex object shapes:

* add property-level JSDoc directly above each important field
* explain meaning, not merely type
* note defaults when applicable
* describe constraints or expectations

For union types:

* explain what each variant represents
* clarify behavioral differences between variants

For generic types:

* use `@typeParam`
* explain what each type parameter controls

---

## Exported Functions

Document:

* what the function does
* important side effects
* lifecycle implications
* important defaults applied
* constraints or failure conditions

Include:

* `@typeParam` for generics
* `@param` for all meaningful parameters
* `@returns`
* `@example` for primary public APIs

Examples should be:

* minimal
* current
* aligned with public usage patterns

Do not duplicate implementation details that are obvious from the signature.

---

## Exported Constants

Document:

* what the constant represents
* why it exists
* how it is used
* whether consumers should rely on it

For default-value objects:

* explain that values are applied when options are omitted

---

## Internal Symbols

Use concise single-line summaries.

Examples:

* helper purpose
* normalization step
* validation responsibility
* cache behavior
* internal state meaning

Avoid excessive detail.

---

# Quality Standards

Every JSDoc entry should:

* be derived from actual implementation
* explain purpose, not restate syntax
* improve editor hover/helpfulness
* avoid redundant wording
* remain concise
* reflect current behavior

Bad:

```ts
/** The path. */
path: string
```

Good:

```ts
/** URL path pattern used to match incoming requests. Supports parameterized segments. */
path: string
```

Prefer meaningful explanations over obvious descriptions.

---

# Style Rules

Use:

* `@typeParam`
* `@param`
* `@returns`
* `@example`
* `{@link}`

Do not use:

* `@type`
* `@typedef`
* `@template`
* `@return`
* inline `//` comments

Use property-level JSDoc above fields instead of parent-level `@property` tags.

Mention defaults when known:

* `Defaults to ...`

Keep summary lines short and readable.

Prefer semantic descriptions over implementation trivia.

---

# Verification

After updating JSDoc:

1. Ensure every public export has appropriate JSDoc
2. Ensure complex exported object properties are documented
3. Ensure generic parameters are explained
4. Ensure defaults are documented where applicable
5. Ensure internal helpers have minimal orientation comments
6. Remove stale or incorrect existing JSDoc
7. Verify comments match implementation behavior

Then run the normal verification workflow:

* `npm run lint:fix`
* `npm run typecheck`
* `npm run test`

JSDoc changes must not introduce formatting issues or break compilation.

---

# Important Rules

* Only modify JSDoc comments
* Do not change code behavior
* Do not change type definitions
* Do not change exports
* Do not change runtime logic
* Do not document tests
* Do not preserve outdated comments without verification
* Source code overrides existing JSDoc when they conflict
* Prefer useful documentation over exhaustive verbosity
* Internal comments should remain lightweight
