# Halide Agent Guide

## Commands

- `npm run build` — tsup → dist/ (ESM + CJS + .d.ts). Prebuild hook runs `npm i`, `tsx scripts/update-readme.ts`, then `typecheck`. Postbuild copies `skill/` and `docs/` into dist/.
- `npm run lint` — Biome check only (read-only).
- `npm run lint:fix` — Biome `--write` + Prettier `--write`.
- `npm run lint:watch` — nodemon reruns `lint:fix` on `.ts`/`.json` changes in src/.
- `npm run typecheck` — `tsc --noEmit`.
- `npm run test` — `vitest run --coverage`. Single file: `npx vitest run src/config/validate.spec.ts`.
- `npm run test:watch` — `vitest` (watch mode).
- `npm run test:ui` — `vitest --ui`.
- `npm run cli` — `node dist/cli/index.js`.
- `npm run sonar` — `npm run test && npx dotenv -- npx sonar`. Coverage excluded: `*.spec.ts`, `scripts/`, `src/demo.ts`.

Pre-commit order: `lint:fix` → `typecheck` → `test`. Coverage thresholds: 80% (all metrics).

## Linting — Biome vs Prettier

- **Biome** owns `.ts`, `.css`, `.json` — single quotes, semicolons, trailing commas, 100 char width.
- **Prettier** owns `.html`, `.yml`, `.yaml`, `.md` only (see `.prettierignore`).
- Do not run Prettier on `.ts`. Do not run Biome on `.html` (formatter disabled in `biome.json`).

## Architecture

- **Framework**: Hono (not Express). All HTTP types come from `hono`.
- **Entry**: `src/index.ts` → re-exports `createServer`, `createApp`, `apiRoute`, `proxyRoute`, and types.
- `ServerConfig` uses **separate arrays**: `apiRoutes` (type `'api'`) + `proxyRoutes` (type `'proxy'`), not a single `routes` array.
- Auth config is nested: `security.auth.strategy` (`'bearer'` | `'jwks'`), not a top-level `auth` key.
- API route handler signature: `(ctx, app)` — 2 params. `ctx` is `RequestContext & { body: TBody }` (plain object, not Hono Context). `app` bundles `{ claims, logger }`.
- Auth uses `hono/jwt` (bearer) and `hono/jwk` (JWKS) — not `jose`.
- Validation uses Zod schemas in `src/config/schema.ts` with custom cross-field validators in `src/config/validate.ts` — Zod only for route body validation and OpenAPI schemas.
- CSP directives use camelCase (`defaultSrc`), not kebab-case (`default-src`) — validator throws on kebab.
- Default logger is styled (colored in TTY, plain text otherwise) via `createDefaultLogger()` in `defaults.ts`. Falls back to plain `[LEVEL] message` when output is not a TTY. Use `createNoopLogger()` for silent output.
- App `apiPrefix` defaults to `'/api'` — paths under that prefix get 404 instead of app fallback (set `apiPrefix: ''` to disable).
- `src/demo.ts` is **not exported** — demo apps only.

Directory structure:

- **src/config/** — types, defaults, validation
- **src/middleware/** — auth (bearer + JWKS), CORS, CSP, rate limit, request ID, error handler, OpenAPI (Scalar UI)
- **src/routes/** — `apiRoute.ts`, `proxyRoute.ts`, `registry.ts` (route registration), `app.ts` (static files)
- **src/services/** — `proxy.ts` (proxy handler)
- **src/utils/** — `secretCache.ts` (JWT secret caching)
- **src/cli/** — CLI commands (`npx halide init`)

## Testing

- Co-located `*.spec.ts` alongside source.
- Vitest `globals: true` — use `describe`/`it`/`expect`/`vi` without imports.
- Auth tests use real `hono/jwt` `sign()` and `Hono` app instances (no mocking).
- Test environment: `node`.

## TypeScript

- Strict + `noUncheckedIndexedAccess`.
- Module: `es2022` / `bundler` resolution — use `.js` extensions in relative imports.
- Target: ES2022.

## Gotchas

- `noConsole` — use the `Logger` interface, not `console.log`.
- `noExplicitAny` — never use `any`.
- `useNodejsImportProtocol` — use `node:` prefix for Node built-ins.
- `useExplicitType` (nursery) — always annotate return types on exported functions.
- `useTemplate` — prefer template literals over string concatenation.
- `noConfusingVoidType` — use `undefined` instead of `void` in return types.
- `noNonNullAssertion` is off — `!` is allowed.
- `useIterableCallbackReturn` — callbacks (`map`/`filter`/`forEach`) must return a value.
- `noGlobalIsFinite` — use `Number.isFinite()` instead of `isFinite()`.
- Biome assist auto-runs on `lint:fix`: organizes imports, sorts interface members, object keys, attributes.
- Default port: 3553 (from `process.env.PORT` fallback in `runtime.ts`).
- Private routes require `security.auth` configured — validation throws otherwise.
- `"type": "module"` — ESM project. Node >=24.0.0 (enforced in `engines`).
- CORS wildcard origin (`*`) + `credentials: true` throws — validator rejects.
- `apiRoute()` and `proxyRoute()` factory functions fill in `type` and default `authorize` — prefer them over raw route objects.
- `proxyRoute` requires `methods` array; `apiRoute` has optional `method` (defaults to `'get'`).
- `createApp` builds the Hono app without starting; `createServer` wraps it with lifecycle (`start`/`stop`/`ready`).
- OpenAPI UI disabled by default (`openapi.enabled` defaults false). When enabled, warns about relaxed CSP — disable in production.
- `observability.onRequest`/`onResponse` hooks fire per-route; set `observe: false` to skip.
- `security.auth.secret` can be async; `secretTtl` (default 60s) controls cache.
- Proxy routes support `identity`, `transform`, and `authorize` per route.
- Proxy routes forward `x-forwarded-for` by default (see `DEFAULT_FORWARD_HEADERS` in `proxy.ts`). Consumers relying on client IP detection should account for this. To disable, set `forwardHeaders: []` on the proxy route.
- Rate limit uses in-memory store with internal `dispose` cleanup.
- Published files: `dist`, `LICENSE`, `package.json`, `README.md` (see `files` in `package.json`).
