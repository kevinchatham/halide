import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import stripJsonComments from 'strip-json-comments';

const SERVER_TS = `import { createServer, apiRoute } from 'halide';

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
    root: 'dist',
  },
});

server.start((port) => {
  console.log(\`Server running on port \${port}\`);
});
`;

const TSCONFIG_SERVER = `{
  "compilerOptions": {
    "module": "es2022",
    "moduleResolution": "bundler",
    "outDir": "./dist",
    "rootDirs": ["."],
    "skipLibCheck": true,
    "target": "es2022",
    "types": ["node"]
  },
  "include": ["server.ts"]
}
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

function excludeServerFromApp(cwd: string): void {
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

function addTypeModuleToPackageJson(cwd: string): void {
  const pkgPath = path.join(cwd, 'package.json');
  const raw = fs.readFileSync(pkgPath, 'utf8');
  const parsed = JSON.parse(stripJsonComments(raw)) as Record<string, unknown>;

  if (parsed.type === 'module') {
    log('✓ "type": "module" already exists in package.json — skipping');
    return;
  }

  parsed.type = 'module';
  fs.writeFileSync(pkgPath, JSON.stringify(parsed, null, 2), 'utf8');
  log('✓ Added "type": "module" to package.json');
}

function addScriptsToPackageJson(cwd: string): void {
  const pkgPath = path.join(cwd, 'package.json');
  const raw = fs.readFileSync(pkgPath, 'utf8');
  const parsed = JSON.parse(stripJsonComments(raw)) as Record<string, unknown>;

  if (!parsed.scripts || typeof parsed.scripts !== 'object') {
    parsed.scripts = {};
  }

  const scripts = parsed.scripts as Record<string, string>;
  let added = false;

  if (!scripts['halide:start']) {
    scripts['halide:start'] = 'npm run halide:build && node dist/server.js';
    added = true;
  }
  if (!scripts['halide:build']) {
    scripts['halide:build'] = 'tsc --project tsconfig.server.json';
    added = true;
  }

  if (added) {
    fs.writeFileSync(pkgPath, JSON.stringify(parsed, null, 2), 'utf8');
    log('✓ Added halide:start and halide:build scripts to package.json');
  } else {
    log('✓ halide scripts already exist in package.json — skipping');
  }
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
    bun: 'bun add halide && bun add -D @types/node',
    npm: 'npm install halide && npm install -D @types/node',
    pnpm: 'pnpm add halide && pnpm add -D @types/node',
    yarn: 'yarn add halide && yarn add -D @types/node',
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
  addTypeModuleToPackageJson(cwd);
  addScriptsToPackageJson(cwd);

  execSync('npx skills add kevinchatham/halide', { cwd, stdio: 'inherit' });

  log('\nDone! Next steps:');
  log('  1. Edit server.ts to configure your routes and SPA');
  log('  2. Run your server with: npm run halide:start');
}

export {
  addScriptsToPackageJson,
  addTypeModuleToPackageJson,
  detectPackageManager,
  getInstallCmd,
  runQuietly,
  SERVER_TS,
  TSCONFIG_SERVER,
};
