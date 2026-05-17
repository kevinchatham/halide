# CLI

Halide provides a CLI for scaffolding a new server in your project.

```bash
npx halide init
```

## `init`

Interactively scaffolds a Halide server in the current project. It prompts for:

1. **Project directory** — where to create files (default: current directory)
2. **App name** — used in log output (default: `halide-app`)
3. **Port** — server listen port (default: `3553`)
4. **Project type** — "Full project" (multi-file) or "Single file" (default: Full project)
5. **Install AI coding skills** — optionally copies halide skill from node_modules (default: yes)

### CLI flags

| Flag            | Description                                           |
| --------------- | ----------------------------------------------------- |
| `--dry-run`     | Preview changes without modifying any files           |
| `--force`       | Overwrite existing files without prompting            |
| `--skills-only` | Only install AI coding skills, skip other scaffolding |
| `--project-dir` | Target directory for non-interactive setup            |

### Full project structure

The default "Full project" type creates a multi-file structure:

```
src/
  halide/
    builder.ts      — defineHalide() call, exports apiRoute, proxyRoute, createServer, createApp
    types.ts        — UserClaims + LogScope interfaces
  routes/
    health.ts       — public health check route
    index.ts        — barrel export of all route arrays
  server.ts         — assembles config, imports routes, starts server
```

**Generated `src/halide/builder.ts`:**

```ts
import { defineHalide } from 'halide';
import type { UserClaims, LogScope } from './types';

export const { apiRoute, proxyRoute, createServer, createApp } = defineHalide<
  UserClaims,
  LogScope
>();
```

**Generated `src/halide/types.ts`:**

```ts
export interface UserClaims {
  sub: string;
  role: 'admin' | 'user';
}

export interface LogScope {
  requestId: string;
  userId?: string;
}
```

**Generated `src/routes/health.ts`:**

```ts
import { apiRoute } from '../halide/builder';

export const healthRoutes = [
  apiRoute({
    access: 'public',
    path: '/health',
    handler: async (_ctx, _app) => ({ status: 'ok' }),
  }),
];
```

**Generated `src/routes/index.ts`:**

```ts
export { healthRoutes } from './health';
```

**Generated `src/server.ts`:**

```ts
import { createServer } from './halide/builder';
import { healthRoutes } from './routes';

const server = createServer({
  apiRoutes: [...healthRoutes],
  app: {
    name: 'my-app',
    port: 3553,
    root: 'dist',
  },
});

server.start();
```

### Single file structure

The "Single file" type creates a minimal setup:

```
server.ts
```

**Generated `server.ts`:**

```ts
import { defineHalide } from 'halide';

const { apiRoute, createServer } = defineHalide();

const healthRoute = apiRoute({
  access: 'public',
  handler: async (_ctx, _app) => ({ status: 'ok' }),
  method: 'get',
  path: '/health',
});

const server = createServer({
  apiRoutes: [healthRoute],
  app: {
    name: 'my-app',
    port: 3553,
    root: 'dist',
  },
});

server.start();
```

### Generated scripts

| Script         | Single file                                   | Full project                                      |
| -------------- | --------------------------------------------- | ------------------------------------------------- |
| `halide:build` | `tsc --project tsconfig.server.json`          | `tsc --project tsconfig.server.json`              |
| `halide:start` | `npm run halide:build && node dist/server.js` | `npm run halide:build && node dist/src/server.js` |

### Generated tsconfig files

**`tsconfig.server.json` (single file):**

```json
{
  "compilerOptions": {
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true,
    "module": "commonjs",
    "outDir": "./dist",
    "resolveJsonModule": true,
    "strict": true,
    "target": "es2022",
    "types": ["node"]
  },
  "include": ["server.ts"]
}
```

**`tsconfig.server.json` (full project):**

```json
{
  "compilerOptions": {
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true,
    "module": "commonjs",
    "outDir": "./dist",
    "resolveJsonModule": true,
    "strict": true,
    "target": "es2022",
    "types": ["node"]
  },
  "include": ["src/server.ts"]
}
```

### Setup steps

Then it:

1. Detects your package manager (npm, pnpm, yarn, or bun)
2. Installs `halide` and `@types/node`
3. Creates project files (full project structure or single `server.ts`)
4. Creates `tsconfig.server.json` for the server entry point
5. Updates `tsconfig.json` references to include `tsconfig.server.json`
6. Excludes the server file from `tsconfig.app.json` (`server.ts` or `src/server.ts`)
7. Adds `halide:start` and `halide:build` scripts to `package.json`
