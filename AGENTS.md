# bSPA Agent Guide

## Key Commands

```bash
npm run build        # Build with tsup (outputs to dist/)
npm run lint:fix     # Biome check + fix
npm run typecheck    # tsc --noEmit
npm run test          # Vitest watch mode
npm run test:run      # Vitest single run
```

## Workflow

`lint:fix` → `typecheck` → `test` (run in this order before committing)

## Architecture

- **Main library**: `src/` — BFF server library (Express + Zod + jose for JWT/JWKS)
- **Demos**: `demo/angular-spa` (port 3001), `demo/backend` (port 3000)
- Tests in `src/**/*.spec.ts` using Vitest with `environment: 'node'`

## Toolchain

- **Bundler**: tsup (ESM + CJS)
- **Linter/Formatter**: Biome (not ESLint/Prettier)
- **TypeScript**: Strict mode with `noUncheckedIndexedAccess`

## Demo Commands

```bash
npm run demo:install   # Install all demos (runs demo:link, then installs)
npm run demo:link      # Build + npm link for local bspa package
npm run demo:backend:serve
npm run demo:angular:serve
```

## Notes

- Biome ignores `*.json`, `dist/`, `.vscode/`, `.angular/`
- Angular demo uses its own tsconfig and build config