---
description: Scan src/ and add/update JSDoc comments on all exported types, interfaces, functions, and type alias declarations
agent: code
---

## Overview

This command scans all TypeScript source files under `src/` (excluding `*.spec.ts` test files) and adds or updates JSDoc comments on every exported type, interface, type alias, function, and interface property, plus minimal JSDoc on non-exported (private/internal) symbols. The goal is comprehensive JSDoc for the public API and lightweight orientation comments for internal helpers.

## Scope

**Public API** (full JSDoc with `@typeParam`, `@param`, `@returns`, defaults, `{@link}`, examples):

- Exported `type` aliases (e.g. `export type RequestContext = {...}`)
- Exported `interface` declarations (e.g. `export interface Server {...}`)
- Exported functions (e.g. `export function createServer<TClaims>(...)`)
- Exported constants (e.g. `export const DEFAULTS = {...}`)
- Properties within exported types and interfaces (e.g. `path: string` inside `ApiRoute`)
- Parameters of exported functions (via `@param` tags)

**Internal symbols** (minimal JSDoc — single summary line only, no `@param`/`@returns`/`@typeParam`):

- Non-exported functions and helpers (e.g. `function matchesAudience(...)`)
- Non-exported type aliases and interfaces (e.g. `type HalideVariables = ...`)
- Non-exported constants (e.g. `const STATUS_CODE = 401`)

**Exclude**:

- `*.spec.ts` test files — never add JSDoc to tests
- Inline type literals inside function signatures (e.g. the shape of a callback parameter) — unless they are extracted into a named type
- Re-export statements (e.g. `export { foo } from './bar.js'`)
- Obvious one-liners where the name fully explains the symbol (e.g. `const port = 3553`)

## Steps

### Phase 1: Read All Source Files

1. Glob all `.ts` files under `src/` excluding `*.spec.ts`: `src/**/*.ts` but filter out `*.spec.ts`.
2. Read every file. Understand what each exported symbol does by reading its implementation, usage sites, and the types it depends on.
3. Build a mental map of the public API surface — what is exported from `src/index.ts` (the package entry point) versus what is exported from internal modules but re-exported. Also identify non-exported helpers that need minimal JSDoc.

### Phase 2: Write JSDoc for Type Definitions

For each file, add JSDoc to:

4. **Exported type aliases** — describe what the type represents and what it's used for. For union types, describe what each branch means. For generic types, explain the type parameter in a `@typeParam` tag.

   Example:
   ```ts
   /** Strategy for extracting claims from a request context. */
   export type ClaimExtractor<TClaims = unknown> = (c: Context) => Promise<TClaims | null>;
   ```

5. **Exported interfaces** — describe the interface's purpose. Document each property with a `@property` (or `@prop`) tag. Mark optional properties and explain what the default is when omitted (referencing `src/config/defaults.ts`).

   Example:
   ```ts
   /**
    * Configuration for the Halide server.
    * @typeParam TClaims - The type of the decoded JWT claims object.
    */
   export type ServerConfig<TClaims = unknown> = {
     /** SPA hosting configuration. This is the only required config section. */
     spa: SpaConfig;
     /** API route definitions. Each route maps a path+method to a handler function. */
     apiRoutes?: ApiRoute<TClaims, unknown>[];
     /** Proxy route definitions. Each route forwards requests to an upstream target. */
     proxyRoutes?: ProxyRoute<TClaims>[];
     /** Security configuration: auth, CORS, CSP, rate limiting. */
     security?: SecurityConfig;
     /** OpenAPI/Scalar documentation UI configuration. */
     openapi?: OpenApiConfig;
     /** Observability: logging, request IDs, lifecycle hooks. */
     observability?: ObservabilityConfig<TClaims>;
   };
   ```

6. **Inline properties** — for types with many fields (like `ServerConfig`, `ApiRoute`, `ProxyRoute`, `SecurityConfig`, `CorsConfig`, `CspDirectives`, `ObservabilityConfig`), add a JSDoc line on **every** property, not just the type itself. This is the most valuable documentation for consumers.

7. **Enum-like union types** — for string unions like `'bearer' | 'jwks'`, describe what each value means.

   Example:
   ```ts
   /**
    * Authentication strategy.
    * - `'bearer'` — HS256 JWT via `hono/jwt` with a shared secret.
    * - `'jwks'` — RS256 JWT via `hono/jwk` with a JWKS endpoint.
    */
   strategy?: 'bearer' | 'jwks';
   ```

### Phase 3: Write JSDoc for Functions

8. **Exported functions** — add a JSDoc block with:
   - A summary line describing what the function does.
   - `@typeParam` for each generic type parameter.
   - `@param` for each function parameter (name and description).
   - `@returns` describing the return value.
   - `@example` only for the main public API functions (`createServer`, `createApp`, `apiRoute`, `proxyRoute`).

   Example:
   ```ts
   /**
    * Create a fully-configured Halide server with lifecycle management.
    *
    * The server is synchronous to create. Call `server.start()` to listen.
    * Graceful shutdown is handled automatically on SIGINT/SIGTERM.
    *
    * @typeParam TClaims - The type of the decoded JWT claims object.
    * @param configInput - The server configuration.
    * @returns A `Server` object with `ready`, `start`, and `stop` methods.
    */
   export function createServer<TClaims = unknown>(configInput: ServerConfig<TClaims>): Server {
   ```

9. **Factory functions** — for `apiRoute()` and `proxyRoute()`, document what defaults the factory fills in (e.g. `apiRoute()` sets `type: 'api'` and a default `authorize` function).

### Phase 4: Write Minimal JSDoc for Internal Symbols

10. **Non-exported functions** — add a single-line JSDoc summary. No `@param`, `@returns`, or `@typeParam` needed. The goal is orientation: a reader scanning the file should instantly know what each helper does without reading its body.

    Example:
    ```ts
    /** Check whether the JWT audience claim matches the expected value. */
    function matchesAudience(aud: unknown, expected: string): boolean {
    ```

11. **Non-exported types and interfaces** — add a single-line summary.

    Example:
    ```ts
    /** Hono context variables used internally by Halide middleware. */
    type HalideVariables = { rawBody?: unknown };
    ```

12. **Non-exported constants** — add a single-line summary only if the name alone isn't self-explanatory. Skip trivial assignments like `const port = 3553`.

### Phase 5: Write JSDoc for Constants

13. **Exported constants** — document what the constant contains and why it exists.

    Example:
    ```ts
    /**
     * Default configuration values used when options are omitted.
     * These are applied during server creation in `createApp` and `createServer`.
     */
    export const DEFAULTS = { ... };
    ```

### Phase 6: Verify and Fix

14. After writing all JSDoc, run the full pre-commit workflow:
    - `npm run lint:fix` — Biome must pass (JSDoc comments are not linted by Biome, but ensure no formatting regressions).
    - `npm run typecheck` — TypeScript must still compile. JSDoc type references in `{@link}` or `@typeParam` must not break compilation.
    - `npm run test` — All tests must pass.

15. Verify JSDoc quality:
    - Every exported symbol in `src/index.ts` has a JSDoc block.
    - Every property in complex types (`ServerConfig`, `ApiRoute`, `ProxyRoute`, `SecurityConfig`, `CorsConfig`, `CspDirectives`, `ObservabilityConfig`, `SecurityAuthConfig`, `SpaConfig`, `OpenApiConfig`) has a property-level doc.
    - Default values are mentioned in property docs (e.g. `Defaults to '/api'`).
    - No JSDoc says `@param ctx - The context` without explaining what the context contains.
    - No JSDoc merely restates the type (e.g. `/** The path. */ path: string` is bad; `/** URL path pattern for this route. Supports Hono-style path parameters like `/users/:id`. */ path: string` is good).

## JSDoc Style Rules

- **Use `@typeParam`** for generic type parameters (TypeScript-specific JSDoc tag).
- **Use `@param`** for function parameters.
- **Use `@returns`** (not `@return`) for return values.
- **Use property docs** (JSDoc line directly above the property) for type/interface fields, NOT `@property` tags on the parent — this reads better in editors.
- **Mention defaults**: When a property has a default from `src/config/defaults.ts`, write `Defaults to X` at the end of the doc line.
- **Link related types**: Use `{@link TypeName}` to reference other types when it helps understanding.
- **No redundant wording**: Don't start descriptions with "A" or "An" when the type name already implies what it is. `/** JWT claims extractor */` is better than `/** A function that extracts JWT claims */`.
- **Concise first line**: The summary line should fit on one line (under 100 chars). Put detailed explanations after a blank line in the same JSDoc block.
- **TypeScript-typed JSDoc**: Do NOT use `@type`, `@typedef`, or `@template` tags — TypeScript already knows the types. Only use semantic tags (`@typeParam`, `@param`, `@returns`, `@example`, `{@link}`).

## Important Rules

- **Only add JSDoc — do not change any code logic, types, or exports.** The JSDoc addition must be a pure documentation change.
- **Do not add JSDoc to `*.spec.ts` files.**
- **Internal symbols get minimal JSDoc** — single summary line only, no `@param`/`@returns`/`@typeParam`/`@example`. Skip trivial assignments where the name is self-explanatory.
- **Do not use `@type` or `@typedef` JSDoc tags.** TypeScript handles typing; JSDoc is for prose descriptions only.
- **Do not add `//` inline comments.** Use only `/** */` JSDoc blocks.
- **Biome owns `.ts` files** — `npm run lint:fix` will format them. Make sure JSDoc doesn't trigger Biome errors (it shouldn't, but verify).
- **No comments** is a Biome error only for `noConsole` and similar rules — JSDoc (`/** */`) is fine.
- **`noConsole` is a Biome error** — if you spot `console.log` while reading files, do NOT fix it (that's a code change, not a JSDoc change). Only add JSDoc.
- After all JSDoc is written, run `npm run lint:fix && npm run typecheck && npm run test` to verify nothing broke.
