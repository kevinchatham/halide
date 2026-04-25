# CLI

Halide provides a CLI for scaffolding a new server in your project.

```bash
npx halide init
```

## `init`

Interactively scaffolds a Halide server in the current project. It prompts for:

1. **SPA name** — used in log output (default: `my-app`)
2. **Port** — server listen port (default: `3553`)
3. **Install AI coding skills** — optionally runs `npx skills add kevinchatham/halide` (default: yes)

Then it:

1. Detects your package manager (npm, pnpm, yarn, or bun)
2. Installs `halide` and `@types/node`
3. Creates `server.ts` with a health route
4. Creates `tsconfig.server.json` for the server entry point
5. Updates `tsconfig.json` references to include `tsconfig.server.json`
6. Excludes `server.ts` from `tsconfig.app.json`
7. Adds `"type": "module"` to `package.json` if not present
8. Adds `halide:start` and `halide:build` scripts to `package.json`

### Generated `server.ts`

```ts
import { createServer, apiRoute } from 'halide';

const server = createServer({
  apiRoutes: [
    apiRoute({
      access: 'public',
      handler: async () => ({ status: 'ok' }),
      method: 'get',
      path: '/health',
    }),
  ],
  spa: {
    name: 'my-app',
    port: 3553,
    root: 'dist',
  },
});

server.start((port) => {
  console.log(`Server running on port ${port}`);
});
```

### Generated scripts

| Script         | Command                                       |
| -------------- | --------------------------------------------- |
| `halide:build` | `tsc --project tsconfig.server.json`          |
| `halide:start` | `npm run halide:build && node dist/server.js` |
