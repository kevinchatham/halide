import fs from 'node:fs';
import path from 'node:path';
import { applyEdits, modify, parse } from 'jsonc-parser';
import stripJsonComments from 'strip-json-comments';

/**
 * Generate the server.ts starter file content for a new Halide project.
 * Creates a basic server with a health check route.
 *
 * @param appName - The application name for the server config.
 * @param port - The port number to listen on.
 * @returns The server.ts file content as a string.
 */
export function generateServerTs(appName: string, port: number): string {
  return `import { defineHalide } from 'halide';

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
    name: '${appName}',
    port: ${port},
    root: 'dist',
  },
});

server.start();
`;
}

/**
 * TypeScript configuration for the server build.
 *
 * Used by `writeTsconfigServer` to create tsconfig.server.json.
 * Targets ES2022 with CommonJS modules for the server build.
 */
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

/**
 * Write tsconfig.server.json if it doesn't already exist in the project root.
 *
 * Creates a minimal TypeScript config targeting ES2022 with CommonJS modules
 * for the server build. Skips if the file exists unless `force` is true.
 *
 * @param cwd - The project working directory.
 * @param dryRun - When true, logs what would be written without creating files.
 * @param force - When true, overwrites the existing file.
 */
export function writeTsconfigServer(cwd: string, dryRun = false, force = false): void {
  const tsconfigServerPath = path.join(cwd, 'tsconfig.server.json');
  if (!force && fs.existsSync(tsconfigServerPath)) {
    log('✓ tsconfig.server.json already exists — skipping');
    return;
  }
  if (dryRun) {
    log('\u2139 [dry-run] Would create tsconfig.server.json');
    return;
  }
  fs.writeFileSync(tsconfigServerPath, TSCONFIG_SERVER, 'utf8');
  log('✓ Created tsconfig.server.json');
}

/**
 * Add tsconfig.server.json reference to tsconfig.json, skipping if already referenced.
 *
 * Parses the project's tsconfig.json and appends a `{ "path": "./tsconfig.server.json" }`
 * reference to the `references` array. Uses jsonc-parser for comment-aware editing.
 *
 * @param cwd - The project working directory.
 * @param dryRun - When true, logs what would be added without modifying files.
 * @param force - When true, removes existing reference before adding a new one.
 */
export function addServerReference(cwd: string, dryRun = false, force = false): void {
  const tsconfigPath = path.join(cwd, 'tsconfig.json');
  if (!fs.existsSync(tsconfigPath)) return;

  const raw = fs.readFileSync(tsconfigPath, 'utf8');
  const parsed = parse(raw) as Record<string, unknown>;

  if (!Array.isArray(parsed.references)) return;

  const normalizedPath = path.normalize('./tsconfig.server.json');
  const alreadyReferenced = (parsed.references as Array<Record<string, string>>).some(
    (ref) => path.normalize(ref.path ?? '') === normalizedPath,
  );
  if (alreadyReferenced && !force) return;

  if (dryRun) {
    log('\u2139 [dry-run] Would add tsconfig.server.json reference to tsconfig.json');
    return;
  }

  const formattedOptions = { insertSpaces: true, tabSize: 2 };
  let edits: ReturnType<typeof modify>;
  if (force) {
    const filteredRefs = (parsed.references as Array<Record<string, string>>).filter(
      (ref) => path.normalize(ref.path ?? '') !== normalizedPath,
    );
    edits = modify(raw, ['references'], [...filteredRefs, { path: './tsconfig.server.json' }], {
      formattingOptions: formattedOptions,
    });
  } else {
    edits = modify(
      raw,
      ['references', -1],
      { path: './tsconfig.server.json' },
      { formattingOptions: formattedOptions },
    );
  }
  fs.writeFileSync(tsconfigPath, applyEdits(raw, edits), 'utf8');
  log('✓ Added tsconfig.server.json reference to tsconfig.json');
}

/** Resolved app tsconfig info with raw content to avoid double reads. */
export interface ResolvedTsconfig {
  /** The raw tsconfig.json content as a string. */
  content: string;
  /** The filename of the resolved tsconfig (e.g., `'tsconfig.json'`). */
  name: string;
}

/**
 * Resolve the app tsconfig file, returning filename, raw content, and parsed references info.
 *
 * Checks for `tsconfig.app.json`, `tsconfig.web.json`, and `tsconfig.json` in order.
 * Returns null when no app tsconfig is found.
 *
 * @param cwd - The project working directory.
 * @returns The resolved tsconfig info, or null when not found.
 */
export function resolveAppTsconfig(cwd: string): ResolvedTsconfig | null {
  const candidates = ['tsconfig.app.json', 'tsconfig.web.json', 'tsconfig.json'];

  for (const candidate of candidates) {
    const fullPath = path.join(cwd, candidate);
    if (!fs.existsSync(fullPath)) continue;

    if (candidate === 'tsconfig.json') {
      const raw = fs.readFileSync(fullPath, 'utf8');
      const parsed = JSON.parse(stripJsonComments(raw)) as Record<string, unknown>;
      if (Array.isArray(parsed.references)) continue;
      return { content: raw, name: candidate };
    }

    const raw = fs.readFileSync(fullPath, 'utf8');
    return { content: raw, name: candidate };
  }

  return null;
}

/**
 * Add server.ts to the app tsconfig exclude list, skipping if already excluded.
 *
 * Parses the app tsconfig and adds `'server.ts'` to the `exclude` array.
 * Uses jsonc-parser for comment-aware editing.
 *
 * @param cwd - The project working directory.
 * @param dryRun - When true, logs what would be added without modifying files.
 * @param force - When true, removes existing entry before adding a new one.
 * @param cachedContent - Optional pre-read tsconfig content to avoid double reads.
 */
export function excludeServerFromApp(
  cwd: string,
  dryRun = false,
  force = false,
  cachedContent?: string,
): void {
  const resolved = resolveAppTsconfig(cwd);
  if (resolved === null) {
    log('\u26a0 No app tsconfig found — skipping server.ts exclusion');
    return;
  }

  const tsconfigName = resolved.name;
  const appPath = path.join(cwd, tsconfigName);
  if (!fs.existsSync(appPath)) return;

  const raw = cachedContent ?? resolved.content;
  const parsed = parse(raw) as Record<string, unknown>;
  const exclude = Array.isArray(parsed.exclude) ? (parsed.exclude as string[]) : [];

  if (exclude.includes('server.ts') && !force) {
    log('✓ server.ts already excluded — skipping');
    return;
  }

  if (dryRun) {
    log(`\u2139 [dry-run] Would add server.ts to ${tsconfigName} exclude list`);
    return;
  }

  const formattedOptions = { insertSpaces: true, tabSize: 2 };
  let edits: ReturnType<typeof modify>;
  if (Array.isArray(parsed.exclude)) {
    const filteredExclude = force ? exclude.filter((s) => s !== 'server.ts') : exclude;
    edits = modify(raw, ['exclude'], [...filteredExclude, 'server.ts'], {
      formattingOptions: formattedOptions,
    });
  } else {
    const existing =
      parsed.exclude == null || typeof parsed.exclude !== 'string' ? [] : [parsed.exclude];
    edits = modify(raw, ['exclude'], [...existing, 'server.ts'], {
      formattingOptions: formattedOptions,
    });
  }
  fs.writeFileSync(appPath, applyEdits(raw, edits), 'utf8');
  log(`✓ Added server.ts to ${tsconfigName} exclude list`);
}

/** Output a message to stdout with a trailing newline for CLI progress reporting. */
function log(message: string): void {
  process.stdout.write(`${message}\n`);
}
