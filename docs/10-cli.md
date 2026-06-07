# CLI

Halide provides a CLI for scaffolding a new Halide project.

```bash
npx halide init
```

## `init`

Scaffolds a new Halide project. It prompts for:

1. **Project directory** — where to create files (default: current directory)
2. **App name** — used in log output (default: `halide-app`)
3. **Port** — server listen port (default: `3553`)

### CLI flags

| Flag            | Description                                                            |
| --------------- | ---------------------------------------------------------------------- |
| `--dry-run`     | Preview changes without modifying any files                            |
| `--skills-only` | Only install AI coding skills, skip project scaffolding                |
| `--project-dir` | Target directory for the project                                       |
| `--yes` / `-y`  | Accept defaults for app name and port (skips project directory prompt) |

### Full project structure

Creates a multi-file structure:

```
src/
  app/
    builder.ts      — defineHalide() call, exports apiRoute, proxyRoute, createServer, createApp
    types.ts        — UserClaims + LogScope interfaces
  routes/
    health.ts       — public health check route
    index.ts        — barrel export of all route arrays
  server.ts         — assembles config, imports routes, starts server
```

**Generated `src/app/builder.ts`:**

```ts
import { defineHalide } from 'halide';
import type { HalideContext } from 'halide';
import type { UserClaims, LogScope } from './types';

type App = HalideContext<UserClaims, LogScope>;
export const { apiRoute, proxyRoute, createServer, createApp } = defineHalide<App>();
```

**Generated `src/app/types.ts`:**

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
import { apiRoute } from '../app/builder';

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
import { createServer } from './app/builder';
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

### Generated scripts

| Script  | Value                 |
| ------- | --------------------- |
| `build` | `tsc`                 |
| `serve` | `nodemon`             |
| `start` | `node dist/server.js` |

### Generated tsconfig files

**`tsconfig.json`:**

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
  "include": ["src/"]
}
```

### Setup steps

Then it:

1. Creates `package.json` (if missing) and `nodemon.json`
2. Creates `tsconfig.json` for the server build
3. Installs dependencies (`npm install` or `npm install halide && npm install -D @types/node`)
4. Creates project files (full project structure)
