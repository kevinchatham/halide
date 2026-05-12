import fs from 'node:fs';
import path from 'node:path';
import stripJsonComments from 'strip-json-comments';

/** Generate the server.ts content for a new Halide project. */
export function generateServerTs(appName: string, port: number): string {
  return `import { createServer, apiRoute } from 'halide';

const healthRoute = apiRoute({
  access: 'public',
  handler: async () => ({ status: 'ok' }),
  method: 'get',
  path: '/health',
});

const server = createServer({
  apiRoutes: [healthRoute],
  app: {
    name: '${appName}',
    port: ${port},
    root: 'dist',
  },
});

server.start();
`;
}

/** TypeScript configuration for the server build. Used by `writeTsconfigServer`. */
export const TSCONFIG_SERVER = `{
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
`;

/** Write tsconfig.server.json if it doesn't already exist. */
export function writeTsconfigServer(cwd: string): void {
  const tsconfigServerPath = path.join(cwd, 'tsconfig.server.json');
  if (fs.existsSync(tsconfigServerPath)) {
    log('✓ tsconfig.server.json already exists — skipping');
    return;
  }
  fs.writeFileSync(tsconfigServerPath, TSCONFIG_SERVER, 'utf8');
  log('✓ Created tsconfig.server.json');
}

/** Add tsconfig.server.json reference to tsconfig.json, skipping if already referenced. */
export function addServerReference(cwd: string): void {
  const tsconfigPath = path.join(cwd, 'tsconfig.json');
  if (!fs.existsSync(tsconfigPath)) return;

  const raw = fs.readFileSync(tsconfigPath, 'utf8');
  const parsed = JSON.parse(stripJsonComments(raw)) as Record<string, unknown>;

  if (!Array.isArray(parsed.references)) return;

  const alreadyReferenced = (parsed.references as Array<Record<string, string>>).some(
    (ref) => ref.path === './tsconfig.server.json',
  );
  if (alreadyReferenced) return;

  parsed.references.push({ path: './tsconfig.server.json' });
  fs.writeFileSync(tsconfigPath, JSON.stringify(parsed, null, 2), 'utf8');
  log('✓ Added tsconfig.server.json reference to tsconfig.json');
}

/** Exclude server.ts from tsconfig.app.json, adding it to the exclude list if not already present. */
export function excludeServerFromApp(cwd: string): void {
  const appPath = path.join(cwd, 'tsconfig.app.json');
  if (!fs.existsSync(appPath)) return;

  const raw = fs.readFileSync(appPath, 'utf8');
  const parsed = JSON.parse(stripJsonComments(raw)) as Record<string, unknown>;

  if (!Array.isArray(parsed.exclude)) {
    parsed.exclude = ['server.ts'];
    fs.writeFileSync(appPath, JSON.stringify(parsed, null, 2), 'utf8');
    log('✓ Added server.ts to tsconfig.app.json exclude list');
    return;
  }

  if ((parsed.exclude as string[]).includes('server.ts')) return;

  (parsed.exclude as string[]).push('server.ts');
  fs.writeFileSync(appPath, JSON.stringify(parsed, null, 2), 'utf8');
  log('✓ Added server.ts to tsconfig.app.json exclude list');
}

/** Output a message to stdout with a trailing newline. Used for CLI progress reporting. */
function log(message: string): void {
  process.stdout.write(`${message}\n`);
}
