import { execSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { confirm, input } from '@inquirer/prompts';
import stripJsonComments from 'strip-json-comments';

/** Generate the server.ts content for a new Halide project. */
function generateServerTs(appName: string, port: number): string {
  return `import { createServer, apiRoute } from 'halide';

const server = createServer({
  apiRoutes: [
    apiRoute({
      access: 'public',
      handler: async () => ({ status: 'ok' }),
      method: 'get',
      path: '/health',
    }),
  ],
  app: {
    name: '${appName}',
    port: ${port},
    root: 'dist',
  },
});

server.start((port) => {
  console.log(\`Server running on port \${port}\`);
});
`;
}

/** TypeScript configuration for the server build. */
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

/** Output a message to stdout. */
function log(message: string): void {
  process.stdout.write(`${message}\n`);
}

/** Run a command silently, throwing if it fails. */
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

/** Write tsconfig.server.json if it doesn't exist. */
function writeTsconfigServer(cwd: string): void {
  const tsconfigServerPath = path.join(cwd, 'tsconfig.server.json');
  if (fs.existsSync(tsconfigServerPath)) {
    log('✓ tsconfig.server.json already exists — skipping');
    return;
  }
  fs.writeFileSync(tsconfigServerPath, TSCONFIG_SERVER, 'utf8');
  log('✓ Created tsconfig.server.json');
}

/** Add tsconfig.server.json reference to tsconfig.json. */
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

/** Exclude server.ts from tsconfig.app.json. */
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

/** Add "type": "module" to package.json if not present. */
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

/** Add halide:start and halide:build scripts to package.json. */
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

/** Supported package managers for dependency installation. */
type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';

/** Detect which package manager is used in the project. */
function detectPackageManager(cwd: string): PackageManager {
  if (fs.existsSync(path.join(cwd, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fs.existsSync(path.join(cwd, 'yarn.lock'))) return 'yarn';
  if (fs.existsSync(path.join(cwd, 'bun.lock'))) return 'bun';
  if (fs.existsSync(path.join(cwd, 'bun.lockb'))) return 'bun';
  return 'npm';
}

/** Get the install command for a given package manager. */
function getInstallCmd(pkgManager: PackageManager): string {
  const cmds: Record<PackageManager, string> = {
    bun: 'bun add halide && bun add -D @types/node',
    npm: 'npm install halide && npm install -D @types/node',
    pnpm: 'pnpm add halide && pnpm add -D @types/node',
    yarn: 'yarn add halide && yarn add -D @types/node',
  };
  return cmds[pkgManager];
}

/**
 * Copy skill directory from the installed halide package
 * to .agents/skills/halide/ in the consumer project.
 * Docs are NOT copied — agents are directed to read them from node_modules/halide/docs/.
 */
export function installSkillsFromHalide(cwd: string): void {
  try {
    const require = createRequire(import.meta.url);
    const halidePath = require.resolve('halide', { paths: [cwd] });
    const halideDir = path.dirname(halidePath);
    const skillSrc = path.join(halideDir, 'skill');

    const agentsDir = path.join(cwd, '.agents');
    const skillsDest = path.join(agentsDir, 'skills', 'halide');

    fs.mkdirSync(path.join(agentsDir, 'skills'), { recursive: true });
    const entries = fs.readdirSync(skillSrc, { withFileTypes: true });
    for (const entry of entries) {
      fs.cpSync(path.join(skillSrc, entry.name), path.join(skillsDest, entry.name), {
        recursive: entry.isDirectory(),
      });
    }
    log('✓ Installed halide skills to .agents/skills/halide/');
  } catch {
    log(`⚠ Warning: Could not install skills`);
  }
}

export async function init(options?: { skillsOnly?: boolean }): Promise<undefined> {
  const { skillsOnly = false } = options ?? {};
  const cwd = process.cwd();

  if (!fs.existsSync(path.join(cwd, 'package.json'))) {
    process.stderr.write(
      'Error: No package.json found in current directory. Run this in a Node.js project.\n',
    );
    process.exit(1);
  }

  if (skillsOnly) {
    installSkillsFromHalide(cwd);
    return;
  }

  const appName = await input({
    default: 'my-app',
    message: 'What is your app name?',
    validate: (value: string) => {
      if (/^[a-zA-Z0-9_-]+$/.test(value)) return true;
      return 'App name must contain only letters, numbers, dashes, and underscores';
    },
  });

  const port = Number(
    await input({
      default: '3553',
      message: 'What port should the server listen on?',
      validate: (value: string) => {
        const portNum = Number.parseInt(value, 10);
        if (Number.isNaN(portNum) || portNum < 1 || portNum > 65535) {
          return 'Please enter a valid port number (1-65535)';
        }
        return true;
      },
    }),
  );

  const installSkills = await confirm({
    default: true,
    message: 'Install AI coding skills for halide?',
  });

  const pkgManager = detectPackageManager(cwd);
  const installCmd = getInstallCmd(pkgManager);

  log(`Installing halide via ${pkgManager}...`);
  runQuietly(installCmd, cwd);
  log(`✓ Installed halide via ${pkgManager}`);

  const serverPath = path.join(cwd, 'server.ts');
  if (fs.existsSync(serverPath)) {
    log('✓ server.ts already exists — skipping');
  } else {
    fs.writeFileSync(serverPath, generateServerTs(appName, port), 'utf8');
    log('✓ Created server.ts');
  }

  writeTsconfigServer(cwd);
  addServerReference(cwd);
  excludeServerFromApp(cwd);
  addTypeModuleToPackageJson(cwd);
  addScriptsToPackageJson(cwd);

  if (installSkills) {
    installSkillsFromHalide(cwd);
  } else {
    log('✓ Skipping skills installation');
  }

  log('\nDone! Next steps:');
  log('  1. Edit server.ts to configure your routes and app hosting');
  log('  2. Run your server with: npm run halide:start');
}

export {
  addScriptsToPackageJson,
  addTypeModuleToPackageJson,
  detectPackageManager,
  generateServerTs,
  getInstallCmd,
  runQuietly,
  TSCONFIG_SERVER,
};
