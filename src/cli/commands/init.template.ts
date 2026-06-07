import fs from 'node:fs';
import path from 'node:path';
import { cliInfo, cliSuccess } from '../utils/logger.js';

/**
 * Generate the full project structure content for a new Halide project.
 * Creates a multi-file project with typed builder, routes, and server entry.
 *
 * @param appName - The application name for the server config.
 * @param port - The port number to listen on.
 * @returns Object mapping file paths to their content.
 */
export function generateFullProject(appName: string, port: number): Record<string, string> {
  return {
    'src/app/builder.ts': `import { defineHalide } from 'halide';
import type { HalideContext } from 'halide';
import type { UserClaims, LogScope } from './types';

type App = HalideContext<UserClaims, LogScope>;
export const { apiRoute, proxyRoute, createServer, createApp } = defineHalide<App>();
`,
    'src/app/types.ts': `export interface UserClaims {
  sub: string;
  role: 'admin' | 'user';
}

export interface LogScope {
  requestId: string;
  userId?: string;
}
`,
    'src/routes/health.ts': `import { apiRoute } from '../app/builder';

export const healthRoutes = [
  apiRoute({
    access: 'public',
    path: '/health',
    handler: async (_ctx, _app) => ({ status: 'ok' }),
  }),
];
`,
    'src/routes/index.ts': `export { healthRoutes } from './health';
`,
    'src/server.ts': `import { createServer } from './app/builder';
import { healthRoutes } from './routes';

const server = createServer({
  apiRoutes: [...healthRoutes],
  app: {
    name: '${appName}',
    port: ${port},
    root: 'dist',
  },
});

server.start();
`,
  };
}

/**
 * TypeScript configuration template for generated Halide projects.
 *
 * Used by `writeTsconfigServer` to create tsconfig.json during the `init` command.
 * Targets ES2022 with CommonJS modules for the server build.
 */
export const TSCONFIG_PROJECT = `{
  "compilerOptions": {
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true,
    "module": "commonjs",
    "outDir": "./dist",
    "resolveJsonModule": true,
    "rootDir": ".",
    "strict": true,
    "target": "es2022",
    "types": ["node"]
  },
  "include": ["src/"],
  "exclude": ["**/*.spec.ts"]
}
`;

/**
 * Write tsconfig.json if it doesn't already exist in the project root.
 *
 * Creates a minimal TypeScript config targeting ES2022 with CommonJS modules
 * for the server build. Skips if the file exists.
 *
 * @param cwd - The project working directory.
 * @param dryRun - When true, logs what would be written without creating files.
 */
export function writeTsconfigServer(cwd: string, dryRun = false): void {
  const tsconfigPath = path.join(cwd, 'tsconfig.json');
  if (fs.existsSync(tsconfigPath)) {
    cliSuccess('tsconfig.json already exists — skipping');
    return;
  }
  if (dryRun) {
    cliInfo('[dry-run] Would create tsconfig.json');
    return;
  }
  fs.writeFileSync(tsconfigPath, TSCONFIG_PROJECT, 'utf8');
  cliSuccess('Created tsconfig.json');
}

/**
 * Minimal package.json template for a new Halide project.
 *
 * @param appName - The application name.
 * @param version - The halide package version (e.g. from `__PKG_VERSION__`).
 * @returns The package.json content as a string.
 */
export function generatePackageJson(appName: string, version: string): string {
  return `{
  "name": "${appName}",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "build": "tsc",
    "serve": "nodemon",
    "start": "node dist/server.js"
  },
  "dependencies": {
    "halide": "^${version}",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/node": "^24.0.0",
    "nodemon": "^3.1.14",
    "typescript": "~5.9.2"
  }
}
`;
}

/**
 * Nodemon configuration template.
 *
 * @returns The nodemon.json content as a string.
 */
export function generateNodemonJson(): string {
  const config = {
    exec: 'npm run build && npm run start',
    ext: 'ts',
    ignore: ['dist', 'node_modules'],
    watch: ['src'],
  };
  return `${JSON.stringify(config, null, 2)}\n`;
}
