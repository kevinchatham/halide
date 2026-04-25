# Halide Agent Guide

## Commands

```bash
npm run build          # tsup → dist/ (ESM + CJS + .d.ts)
npm run lint           # Biome check only (read-only, no Prettier)
npm run lint:fix       # Biome check --write + Prettier --write (both run)
npm run lint:watch     # nodemon reruns lint:fix on .ts/.json changes
npm run typecheck      # tsc --noEmit
npm run test           # vitest run --coverage (single run + coverage)
npm run test:watch     # vitest (watch, no coverage)
npm run test:ui        # vitest --ui
npm run clean          # npx tsx scripts/clean.ts
npm run cli            # node dist/cli/index.js (run CLI directly)
npm run kill           # fuser -k 3000/3553/4200/tcp (kill demo servers)
npm run sonar          # npm run test && npx dotenv -- npx sonar
npx vitest run src/config/validate.spec.ts  # single test file
```

Note: `npm run build` has a `prebuild` hook that runs `tsx scripts/update-readme.ts` then `typecheck`.

## Pre-commit workflow

`lint:fix` → `typecheck` → `test` — run in this order. Coverage thresholds enforced at 80% (branches/functions/lines/statements).

## Linting — Biome vs Prettier

`lint:fix` runs both. They own different file types and must not cross over:

- **Biome**: `.ts`, `.css`, `.json` — single quotes, semicolons, trailing commas, 100 char width
- **Prettier**: `.html`, `.yml`, `.yaml`, `.md` only (see `.prettierignore`)

Do not run Prettier on `.ts` files. Do not run Biome on `.html` (formatter disabled in `biome.json`).
`npm run lint` is Biome-only (no Prettier). Use `lint:fix` for full formatting.

## Architecture

- **Framework**: Hono (not Express). All HTTP types come from `hono`, not `express`
- **Entry**: `src/index.ts` → re-exports `createServer<TClaims>` from `src/config/runtime.ts`
- `ServerConfig` uses **separate arrays**: `apiRoutes` (type `'api'`) + `proxyRoutes` (type `'proxy'`), not a single `routes` array
- Auth config is nested: `security.auth.strategy` (`'bearer'` | `'jwks'`), not a top-level `auth` key
- API route handler signature is `(ctx, claims, logger)` — 3 params. `ctx` is `RequestContext & { body: TBody }` (plain object, not Hono Context), `claims` is `TClaims | undefined`, `logger` is `Logger`
- Auth uses `hono/jwt` (bearer) and `hono/jwk` (JWKS) — not `jose`
- Validation is imperative (`validateServerConfig` in `src/config/validate.ts`), not Zod — Zod is only used for route body validation and OpenAPI schema generation
- CSP directives must use camelCase (`defaultSrc`), not kebab-case (`default-src`) — validator throws on kebab
- SPA `apiPrefix` defaults to `'/api'` — paths starting with that prefix get 404 instead of SPA fallback (set `apiPrefix: ''` to disable)
- `src/demo.ts` exists but is **not exported** — used by demo apps only
- **src/config/** — types, defaults, validation
- **src/middleware/** — auth (bearer + JWKS via hono/jwt + hono/jwk), CORS, CSP, rate limit, request ID, error handler, OpenAPI (Scalar UI)
- **src/routes/** — `apiRoute.ts`, `proxyRoute.ts`, `registry.ts` (route registration), `spa.ts` (static file serving)
- **src/services/** — `proxy.ts` (proxy handler)
- **src/utils/** — `secretCache.ts` (JWT secret caching for bearer auth)
- **src/cli/** — CLI commands (`npx halide init`)

## Testing

- Test files co-located as `*.spec.ts` alongside source
- Vitest `globals: true` — use `describe`/`it`/`expect`/`vi` without imports
- Auth tests use real `hono/jwt` `sign()` for tokens and `Hono` app instances (no mocking)
- Test environment is `node`

## TypeScript

- Strict mode + `noUncheckedIndexedAccess`
- Module: `es2022` / `bundler` resolution — use `.js` extensions in relative imports
- Target: ES2022

## Demo

```bash
npm run demo:install             # build + link + install both demos
npm run demo:backend:serve       # port 3000
npm run demo:angular:serve       # port 3553
```

`demo:link` builds the library and runs `npm link` so demos resolve `halide` locally. Demo apps are in `demo/backend/` and `demo/angular/`.

## Gotchas

- `noConsole` is a Biome error — use the `Logger` interface, not `console.log`
- `noExplicitAny` is a Biome error
- `useNodejsImportProtocol` is a Biome error — use `node:` prefix for Node built-ins
- `useExplicitType` (nursery) is a Biome error — always annotate return types on exported functions
- `useTemplate` is a Biome error — prefer template literals over string concatenation
- `noConfusingVoidType` is a Biome error — use `undefined` instead of `void` in return types
- `noNonNullAssertion` is off — `!` is allowed when needed
- Biome assist auto-runs on `lint:fix`: organizes imports, sorts interface members, object keys, and attributes
- Default server port is 3553 (from `process.env.PORT` fallback in `runtime.ts`)
- Private routes require `security.auth` to be configured — validation will throw otherwise
- `package.json` declares `"type": "module"` — this is an ESM project
- Node.js >=24.0.0 required (enforced in `engines`)
- CORS wildcard origin (`*`) cannot be combined with `credentials: true` — config validator will throw
- `apiRoute()` and `proxyRoute()` factory functions fill in `type` and default `authorize` — prefer them over raw route objects
- `proxyRoute` requires `methods` array (not optional like `apiRoute.method`)
