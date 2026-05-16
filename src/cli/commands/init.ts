import { execSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { confirm, input } from '@inquirer/prompts';
import { applyEdits, parse as jsoncParse, modify } from 'jsonc-parser';
import {
  addServerReference,
  excludeServerFromApp,
  generateServerTs,
  writeTsconfigServer,
} from './init.template';

/**
 * Execute a shell command silently, capturing stderr and rethrowing on failure.
 *
 * Used to run package manager commands without producing noisy output.
 * Stderr is written to `process.stderr` before rethrowing the error.
 *
 * @internal
 * @param cmd - The shell command to execute (e.g., `'npm install halide'`).
 * @param cwd - The working directory for the command.
 */
export function runQuietly(cmd: string, cwd: string): void {
  try {
    execSync(cmd, { cwd, stdio: 'pipe' });
  } catch (err: unknown) {
    if (err instanceof Error && 'stderr' in err) {
      process.stderr.write((err as Error & { stderr: Buffer }).stderr.toString());
    }
    throw err;
  }
}

/**
 * Add `halide:start` and `halide:build` npm scripts to package.json if they don't already exist.
 *
 * `halide:start` runs `npm run halide:build && node dist/server.js`.
 * `halide:build` runs `tsc --project tsconfig.server.json`.
 *
 * @param cwd - The project working directory.
 * @param dryRun - When true, logs what would be added without writing files.
 * @param force - When true, overwrites existing scripts regardless.
 */
export function addScriptsToPackageJson(cwd: string, dryRun = false, force = false): void {
  const pkgPath = path.join(cwd, 'package.json');
  const raw = fs.readFileSync(pkgPath, 'utf8');

  const newStart = 'npm run halide:build && node dist/server.js';
  const newBuild = 'tsc --project tsconfig.server.json';
  const formattedOptions = { insertSpaces: true, tabSize: 2 };

  if (!force) {
    const parsed = jsoncParse(raw) as Record<string, unknown>;
    const scripts =
      parsed.scripts && typeof parsed.scripts === 'object'
        ? (parsed.scripts as Record<string, string>)
        : {};
    if (scripts['halide:start'] && scripts['halide:build']) return;
  }

  if (dryRun) {
    log('\u2139 [dry-run] Would add halide:start and halide:build scripts to package.json');
    return;
  }

  let result = raw;

  if (force) {
    const modified1 = modify(result, ['scripts', 'halide:start'], newStart, {
      formattingOptions: formattedOptions,
    });
    result = applyEdits(result, modified1);
    const modified2 = modify(result, ['scripts', 'halide:build'], newBuild, {
      formattingOptions: formattedOptions,
    });
    result = applyEdits(result, modified2);
  } else {
    const parsed = jsoncParse(raw) as Record<string, unknown>;
    const scripts =
      parsed.scripts && typeof parsed.scripts === 'object'
        ? (parsed.scripts as Record<string, string>)
        : {};
    if (!scripts['halide:start']) {
      const modified1 = modify(result, ['scripts', 'halide:start'], newStart, {
        formattingOptions: formattedOptions,
      });
      result = applyEdits(result, modified1);
    }
    if (!scripts['halide:build']) {
      const modified2 = modify(result, ['scripts', 'halide:build'], newBuild, {
        formattingOptions: formattedOptions,
      });
      result = applyEdits(result, modified2);
    }
  }

  fs.writeFileSync(pkgPath, result, 'utf8');
  log('✓ Added halide:start and halide:build scripts to package.json');
}

/** Supported package managers for dependency installation. */
type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';

/**
 * Detect which package manager is used in the project by checking for lock files.
 *
 * Checks for `pnpm-lock.yaml`, `yarn.lock`, `bun.lock`, and `bun.lockb` in order.
 * Falls back to `'npm'` when no lock file is found.
 *
 * @param cwd - The project working directory.
 * @returns The detected package manager (`'npm'`, `'pnpm'`, `'yarn'`, or `'bun'`).
 */
export function detectPackageManager(cwd: string): PackageManager {
  if (fs.existsSync(path.join(cwd, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fs.existsSync(path.join(cwd, 'yarn.lock'))) return 'yarn';
  if (fs.existsSync(path.join(cwd, 'bun.lock'))) return 'bun';
  if (fs.existsSync(path.join(cwd, 'bun.lockb'))) return 'bun';
  return 'npm';
}

/**
 * Get the install command for adding `halide` and `@types/node` with the given package manager.
 *
 * @param pkgManager - The detected package manager (`'npm'`, `'pnpm'`, `'yarn'`, or `'bun'`).
 * @returns The install command string (e.g., `'npm install halide && npm install -D @types/node'`).
 */
export function getInstallCmd(pkgManager: PackageManager): string {
  const cmds: Record<PackageManager, string> = {
    bun: 'bun add halide && bun add -D @types/node',
    npm: 'npm install halide && npm install -D @types/node',
    pnpm: 'pnpm add halide && pnpm add -D @types/node',
    yarn: 'yarn add halide && yarn add -D @types/node',
  };
  return cmds[pkgManager];
}

/**
 * Copy the halide skill directory from `node_modules/halide` to `.agents/skills/halide/`.
 *
 * Uses Node.js `require.resolve()` to locate the halide package, then copies
 * the skill directory (excluding docs, which agents read from `node_modules/halide/docs/`).
 * Silently logs a warning if the skill directory cannot be found.
 *
 * @internal
 * @param cwd - The project working directory.
 */
export function installSkillsFromHalide(cwd: string): void {
  try {
    const require = createRequire(import.meta.url);
    const halidePath = require.resolve('halide', { paths: [cwd] });
    const halideDir = path.dirname(halidePath);
    const skillSrc = path.join(halideDir, '..', 'skill');

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

/** Output a message to stdout with a trailing newline for CLI progress reporting. */
function log(message: string): void {
  process.stdout.write(`${message}\n`);
}

export {
  addServerReference,
  excludeServerFromApp,
  generateServerTs,
  resolveAppTsconfig,
  TSCONFIG_SERVER,
  writeTsconfigServer,
} from './init.template';

/**
 * Initialize a new Halide project by prompting for app name, port, and package manager.
 *
 * Installs halide, creates server.ts, writes tsconfig.server.json, adds scripts
 * to package.json, and optionally installs AI coding skills.
 *
 * When `skillsOnly` is true, only installs skills without interactive prompts.
 * When `dryRun` is true, previews all changes without writing files.
 *
 * @param options - Optional configuration. Set `skillsOnly` to skip project setup.
 *   Set `dryRun` to preview changes without writing files.
 *   Set `force` to overwrite existing files.
 */
export async function init(options?: {
  skillsOnly?: boolean;
  dryRun?: boolean;
  force?: boolean;
}): Promise<undefined> {
  const { skillsOnly = false, dryRun = false, force = false } = options ?? {};
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

  if (dryRun) {
    log('\u2139 [dry-run] Skipping interactive prompts');
    log('\u2139 [dry-run] Would install halide');
    log('\u2139 [dry-run] Would create server.ts');
    writeTsconfigServer(cwd, true, force);
    addServerReference(cwd, true, force);
    excludeServerFromApp(cwd, true, force);
    addScriptsToPackageJson(cwd, true, force);
    log('\nDone! (dry-run)');
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

  writeTsconfigServer(cwd, dryRun, force);
  addServerReference(cwd, dryRun, force);
  excludeServerFromApp(cwd, dryRun, force);
  addScriptsToPackageJson(cwd, dryRun, force);

  if (installSkills) {
    installSkillsFromHalide(cwd);
  } else {
    log('✓ Skipping skills installation');
  }

  log('\nDone! Next steps:');
  log('  1. Edit server.ts to configure your routes and app hosting');
  log('  2. Run your server with: npm run halide:start');
}
