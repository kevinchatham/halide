import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

declare const HALIDE_VERSION: string | undefined;

function getHalideVersion(): string {
  if (HALIDE_VERSION !== undefined) return HALIDE_VERSION;
  try {
    const cliDir = path.dirname(fileURLToPath(import.meta.url));
    const pkgPath = path.join(cliDir, '..', '..', 'package.json');
    const raw = fs.readFileSync(pkgPath, 'utf8');
    const parsed: { version: string } = JSON.parse(raw) as { version: string };
    return parsed.version;
  } catch {
    return '0.0.0';
  }
}

const SERVER_TS = `import { createServer, apiRoute } from 'halide';

const server = await createServer({
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
    root: 'dist',
  },
});

await server.start();
`;

const TSCONFIG_SERVER = `{
  "compilerOptions": {
    "module": "es2022",
    "moduleResolution": "bundler",
    "outDir": "./dist",
    "rootDirs": ["."],
    "target": "es2022",
    "types": ["node"]
  },
  "include": ["server.ts"]
}
`;

const AGENTS_MD_CONTENT = `# Halide Agent Guide

## Commands

\`\`\`bash
npm run build          # tsup → dist/ (ESM + CJS + .d.ts)
npm run lint           # Biome check only (read-only, no Prettier)
npm run lint:fix       # Biome check --write + Prettier --write (both run)
npm run typecheck      # tsc --noEmit
npm run test           # vitest run --coverage (single run + coverage)
\`\`\`

## Pre-commit workflow

\`lint:fix\` → \`typecheck\` → \`test\` — run in this order. Coverage thresholds enforced at 80% (branches/functions/lines/statements).

## Architecture

- **Framework**: Hono (not Express). All HTTP types come from \`hono\`, not \`express\`
- \`ServerConfig\` uses **separate arrays**: \`apiRoutes\` (type \`'api'\`) + \`proxyRoutes\` (type \`'proxy'\`), not a single \`routes\` array
- API route handler signature is \`(ctx, claims, logger)\` — 3 params. \`ctx\` is \`RequestContext & { body: TBody }\` (plain object, not Hono Context), \`claims\` is \`TClaims | undefined\`, \`logger\` is \`Logger\`
- Auth config is nested: \`security.auth.strategy\` (\`'bearer'\` | \`'jwks'\`), not a top-level \`auth\` key
- Auth uses \`hono/jwt\` (bearer) and \`hono/jwk\` (JWKS) — not \`jose\`
- Validation is imperative (\`validateServerConfig\`), not Zod — Zod is only used for route body validation and OpenAPI schema generation
- CSP directives must use **camelCase** (\`defaultSrc\`), not kebab-case (\`default-src\`) — validator throws on kebab

## Route Factories

- Use \`apiRoute()\` and \`proxyRoute()\` factory functions — they fill in \`type\` and default \`authorize\`
- \`proxyRoute\` requires a \`methods\` array (not optional like \`apiRoute.method\`)

## Gotchas

- Private routes require \`security.auth\` to be configured — validation will throw otherwise
- CORS wildcard origin (\`*\`) cannot be combined with \`credentials: true\` — config validator will throw
- SPA \`apiPrefix\` defaults to \`'/api'\` — paths starting with that prefix get 404 instead of SPA fallback (set \`apiPrefix: ''\` to disable)
- Node.js >=24.0.0 required
- \`package.json\` declares \`"type": "module"\` — this is an ESM project
`;

function log(message: string): void {
  process.stdout.write(`${message}\n`);
}

function runQuietly(cmd: string, cwd: string): void {
  try {
    execSync(cmd, { cwd, stdio: 'pipe' });
  } catch (err: unknown) {
    if (err instanceof Error && 'stderr' in err) {
      process.stderr.write((err as Error & { stderr: Buffer }).stderr.toString());
    }
    throw err;
  }
}

const START_MARKER_RE = /<!-- halide:([\w.]+) -->/;
const BLOCK_RE = /<!-- halide:[\w.]+ -->[\s\S]*?<!-- \/halide -->/;

function buildAgentsMd(version: string): string {
  return `<!-- halide:${version} -->\n${AGENTS_MD_CONTENT}\n<!-- /halide -->\n`;
}

function writeAgentsMd(cwd: string, version: string): void {
  const agentsMd = buildAgentsMd(version);
  const agentsPath = path.join(cwd, 'AGENTS.md');

  if (!fs.existsSync(agentsPath)) {
    fs.writeFileSync(agentsPath, agentsMd, 'utf8');
    log('✓ Created AGENTS.md');
    return;
  }

  const existing = fs.readFileSync(agentsPath, 'utf8');

  if (!START_MARKER_RE.test(existing)) {
    fs.appendFileSync(agentsPath, `\n\n${agentsMd}`, 'utf8');
    log('✓ Appended Halide section to existing AGENTS.md');
    return;
  }

  const updated = existing.replace(BLOCK_RE, agentsMd);
  fs.writeFileSync(agentsPath, updated, 'utf8');
  log('✓ Updated Halide section in AGENTS.md');
}

function writeTsconfigServer(cwd: string): void {
  const tsconfigServerPath = path.join(cwd, 'tsconfig.server.json');
  if (fs.existsSync(tsconfigServerPath)) {
    log('✓ tsconfig.server.json already exists — skipping');
    return;
  }
  fs.writeFileSync(tsconfigServerPath, TSCONFIG_SERVER, 'utf8');
  log('✓ Created tsconfig.server.json');
}

function addServerReference(cwd: string): void {
  const tsconfigPath = path.join(cwd, 'tsconfig.json');
  if (!fs.existsSync(tsconfigPath)) return;

  const raw = fs.readFileSync(tsconfigPath, 'utf8');
  const parsed = JSON.parse(raw) as Record<string, unknown>;

  if (!Array.isArray(parsed.references)) return;

  const alreadyReferenced = (parsed.references as Array<Record<string, string>>).some(
    (ref) => ref.path === './tsconfig.server.json',
  );
  if (alreadyReferenced) return;

  parsed.references.push({ path: './tsconfig.server.json' });
  fs.writeFileSync(tsconfigPath, JSON.stringify(parsed, null, 2), 'utf8');
  log('✓ Added tsconfig.server.json reference to tsconfig.json');
}

function excludeServerFromApp(cwd: string): void {
  const appPath = path.join(cwd, 'tsconfig.app.json');
  if (!fs.existsSync(appPath)) return;

  const raw = fs.readFileSync(appPath, 'utf8');
  const parsed = JSON.parse(raw) as Record<string, unknown>;

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

type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';

function detectPackageManager(cwd: string): PackageManager {
  if (fs.existsSync(path.join(cwd, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fs.existsSync(path.join(cwd, 'yarn.lock'))) return 'yarn';
  if (fs.existsSync(path.join(cwd, 'bun.lock'))) return 'bun';
  if (fs.existsSync(path.join(cwd, 'bun.lockb'))) return 'bun';
  return 'npm';
}

function getInstallCmd(pkgManager: PackageManager): string {
  const cmds: Record<PackageManager, string> = {
    bun: 'bun add halide',
    npm: 'npm install halide',
    pnpm: 'pnpm add halide',
    yarn: 'yarn add halide',
  };
  return cmds[pkgManager];
}

export async function init(): Promise<undefined> {
  const cwd = process.cwd();

  if (!fs.existsSync(path.join(cwd, 'package.json'))) {
    process.stderr.write(
      'Error: No package.json found in current directory. Run this in a Node.js project.\n',
    );
    process.exit(1);
  }

  const pkgManager = detectPackageManager(cwd);
  const installCmd = getInstallCmd(pkgManager);

  runQuietly(installCmd, cwd);
  log(`✓ Installing halide via ${pkgManager}`);

  const serverPath = path.join(cwd, 'server.ts');
  if (fs.existsSync(serverPath)) {
    log('✓ server.ts already exists — skipping');
  } else {
    fs.writeFileSync(serverPath, SERVER_TS, 'utf8');
    log('✓ Created server.ts');
  }

  writeTsconfigServer(cwd);
  addServerReference(cwd);
  excludeServerFromApp(cwd);

  writeAgentsMd(cwd, getHalideVersion());

  try {
    runQuietly('npx skills add kevinchatham/halide --all -y', cwd);
    log('✓ Installing halide agent skills');
  } catch (err: unknown) {
    if (err instanceof Error && 'stderr' in err) {
      process.stderr.write((err as Error & { stderr: Buffer }).stderr.toString());
    }
    process.stderr.write('⚠ Failed to install agent skills — you can run this manually later:\n');
    process.stderr.write('  npx skills add kevinchatham/halide --all -y\n');
  }

  log('\nDone! Next steps:');
  log('  1. Edit server.ts to configure your routes and SPA');
  log('  2. Run your server with: npx tsx server.ts');
}

export {
  buildAgentsMd,
  detectPackageManager,
  getInstallCmd,
  runQuietly,
  SERVER_TS,
  TSCONFIG_SERVER,
};
