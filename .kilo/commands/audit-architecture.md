---
description: Analyze the Halide architecture and produce a critical implementation review
agent: ask
---

# Purpose

Analyze the current Halide architecture and produce a critical engineering review.

Focus on:
- architectural tradeoffs
- coupling
- scalability
- security
- maintainability
- operational risks
- API ergonomics
- extensibility
- runtime behavior
- failure modes

Do not produce documentation or tutorials.
Produce a technical critique supported by evidence from the implementation.

The source code is the only source of truth.
Existing documentation, comments, and conventions may be outdated or inaccurate.

---

# Source Discovery

Dynamically inspect the repository structure.

Do not rely on hardcoded module paths unless they are verified to exist.

Inspect:
- all non-test source files
- public exports
- runtime composition
- configuration systems
- middleware/lifecycle systems
- routing abstractions
- service boundaries
- auth/security systems
- observability systems
- proxy/runtime behavior
- caching/stateful components
- CLI/runtime tooling
- build/runtime configuration
- package exports and dependencies

Infer the actual architectural boundaries from the implementation.

---

# Architecture Analysis Goals

Identify:
- strong architectural decisions
- accidental complexity
- hidden coupling
- weak abstractions
- unclear ownership boundaries
- scalability bottlenecks
- operational risks
- failure propagation risks
- security gaps
- maintainability problems
- testing challenges
- API ergonomics issues
- extensibility limitations
- implementation inconsistencies
- documentation/runtime drift

Prefer systemic analysis over stylistic critique.

---

# Analysis Areas

Analyze the implementation through the following lenses.

## Public API Design

Critique:
- export surface organization
- API cohesion
- factory patterns
- configuration ergonomics
- type complexity
- abstraction leakage
- consistency of runtime behavior
- backward-compatibility risks

Identify APIs that:
- expose implementation details
- hide important runtime behavior
- encourage misuse
- create difficult upgrade paths

---

## Runtime Architecture

Critique:
- lifecycle ownership
- startup/shutdown flow
- middleware ordering
- request lifecycle composition
- runtime mutation/state
- error propagation
- cancellation/timeout handling
- resource cleanup
- sync vs async boundaries

Identify:
- ordering-dependent behavior
- implicit side effects
- fragile execution paths
- hidden runtime assumptions

---

## Configuration System

Critique:
- configuration complexity
- validation strategy
- defaults strategy
- separation of concerns
- environment handling
- type safety
- discoverability
- evolution/extensibility

Identify:
- ambiguous configuration
- invalid states representable at runtime
- duplicated validation logic
- configuration/runtime drift

---

## Routing & Request Handling

Critique:
- routing abstractions
- handler ergonomics
- request/response abstractions
- proxy behavior
- serialization assumptions
- transform hooks
- composition model
- scalability of route registration

Identify:
- hidden behavior
- difficult-to-debug abstractions
- excessive magic
- inconsistent request semantics

---

## Security Architecture

Critique:
- auth boundaries
- trust assumptions
- secret handling
- caching behavior
- CSP/CORS safety
- rate limiting strategy
- proxy trust model
- default security posture

Distinguish between:
- development-safe defaults
- production-safe defaults

Identify:
- insecure defaults
- weak operational guidance
- bypass opportunities
- state-sharing risks
- insufficient isolation

---

## Stateful Components

Critique:
- caches
- in-memory stores
- singleton behavior
- lifecycle cleanup
- memory growth risks
- concurrency assumptions
- horizontal scaling limitations

Identify:
- stale-state risks
- memory leaks
- unbounded growth
- coordination problems

---

## Tooling & CLI

Critique:
- separation between CLI and runtime
- code reuse
- coupling to implementation internals
- testability
- determinism
- maintainability

---

## Maintainability

Critique:
- module boundaries
- dependency direction
- duplication
- naming consistency
- testability
- internal cohesion
- extensibility

Identify:
- god modules
- cyclic dependencies
- implicit contracts
- fragile abstractions
- architectural drift

---

# Output Requirements

Structure the analysis into:

1. Architecture Strengths
2. Architectural Weaknesses
3. Security Concerns
4. Scalability Risks
5. Maintainability Concerns
6. API Design Concerns
7. Operational Risks
8. Recommendations
9. Highest-Leverage Refactors

Support claims with implementation evidence.

Distinguish between:
- acceptable tradeoffs
- short-term compromises
- long-term architectural risks

Call out ambiguity explicitly when behavior cannot be confidently inferred.

---

# Important Rules

- Be critical, specific, and evidence-based
- Prefer architectural reasoning over stylistic opinions
- Do not assume current module layout is permanent
- Infer architectural boundaries from implementation
- Do not preserve historical assumptions without verification
- Distinguish between consumer-facing concerns and implementation concerns
- Focus on production-readiness, not just local correctness
- Avoid superficial critique without operational impact
- Do not reference repository-internal paths in final output
- Write from the perspective of a consuming engineer evaluating the framework