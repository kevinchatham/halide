# bSPA Agent Guide

## Key Commands

```bash
npm run build          # tsup (ESM + CJS to dist/)
npm run lint:fix       # Biome check --write + Prettier write (both run)
npm run typecheck      # tsc --noEmit
npm run test           # Vitest watch
npm run test:run       # Vitest single run
npm run clean          # Runs scripts/clean.ts
npx vitest run src/config/validate.spec.ts  # single test
```

## Workflow

`lint:fix` → `typecheck` → `test:run` (run in this order before committing)

## Linting

`lint:fix` runs **both** Biome and Prettier. They target different file types:

- **Biome**: `.ts`, `.css`, `.json` — single quotes, semicolons, trailing commas, 100 char width
- **Prettier**: `.html`, `.yml`, `.yaml`, `.md` only (see `.prettierignore`)

Do not run Prettier on `.ts` files — Biome owns those. Do not run Biome on `.html` — Biome HTML formatter is disabled.

## Architecture

- **Entry**: `src/index.ts` → re-exports from `src/runtime.ts` (`createServer<TClaims>` factory)
- `ServerConfig` uses discriminated union routes: `apiRoutes` (type `'api'`) + `proxyRoutes` (type `'proxy'`), not a single `routes` array
- Auth config is nested: `security.auth.strategy` (`'bearer'` | `'jwks'`), not a top-level `auth` key
- **src/config/** — types, defaults, manual validation (`validateServerConfig` — imperative checks, not Zod)
- **src/middleware/** — auth (bearer + JWKS), CORS, CSP, rate limit, request ID, error handler, Swagger UI
- **src/routes/** — `registry.ts` (route registration), `spa.ts` (static file serving)
- **src/services/** — proxy handler
- **src/openapi/** — spec generator from route metadata (uses Zod schemas via `zod-to-json-schema`)
- **src/utils/** — JWT helpers (uses `jose`)
- **src/types/** — Express augmentation

## Testing

- 10 test files co-located as `*.spec.ts` alongside source
- Vitest with `globals: true` — use `describe`/`it`/`expect`/`vi` without imports
- Auth tests mock `jose` and `../utils/jwt` with `vi.mock()`

## TypeScript

- Strict mode + `noUncheckedIndexedAccess`
- Module: `Node16` with `node16` resolution — use `.js` extensions in relative imports
- Express 5 types (`@types/express@^5`)

## Demo

```bash
npm run demo:install             # build + link + install both demos
npm run demo:backend:serve       # port 3000
npm run demo:angular:serve       # port 3001
```

`demo:link` builds the library and runs `npm link` so demos resolve `bspa` locally.

## Gotchas

- `noConsole` is a Biome error — use the `Logger` interface, not `console.log`
- `noExplicitAny` is a Biome error
- `useNodejsImportProtocol` is a Biome error — use `node:` prefix for Node built-ins
- `useExplicitType` (nursery) is a Biome error — always annotate return types on exported functions
- `useTemplate` is a Biome error — prefer template literals over string concatenation
- `noConfusingVoidType` is a Biome error — use `undefined` instead of `void` in return types
- `noNonNullAssertion` is off — `!` is allowed when needed
- Biome assist auto-runs on `lint:fix`: organizes imports, sorts interface members, object keys, and attributes
