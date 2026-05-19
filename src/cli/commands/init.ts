import { execSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { input } from '@inquirer/prompts';
import ora from 'ora';
import { cliInfo, cliLog, cliSuccess, cliTree, cliWarn } from '../utils/logger.js';
import {
  generateFullProject,
  generateNodemonJson,
  generatePackageJson,
  writeTsconfigServer,
} from './init.template';

// @ts-expect-error Injected by tsup define
const halideVersion: string = __PKG_VERSION__;

/**
 * Execute a shell command silently, capturing stderr and rethrowing on failure.
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
 * Build a tree structure from a flat list of file paths using box-drawing characters.
 *
 * @internal
 * @param files - Array of flat file paths (e.g. `['src/server.ts', 'src/routes/health.ts']`).
 * @returns The formatted tree string.
 */
function renderFileTree(files: string[]): string {
  const root: Record<string, unknown> = {};
  for (const file of files) {
    const parts = file.split('/');
    let current: Record<string, unknown> = root;
    for (const part of parts) {
      if (part === undefined) continue;
      const isLast = part === parts.at(-1);
      if (isLast) {
        current[part] = null;
      } else {
        if (!(part in current) || typeof current[part] !== 'object') {
          current[part] = {};
        }
        current = current[part] as Record<string, unknown>;
      }
    }
  }

  const lines: string[] = [];

  function walk(node: Record<string, unknown>, prefix: string): void {
    const entries = Object.entries(node).sort((a, b) => {
      const aIsDir = typeof a[1] === 'object' && a[1] !== null;
      const bIsDir = typeof b[1] === 'object' && b[1] !== null;
      if (aIsDir && !bIsDir) return -1;
      if (!aIsDir && bIsDir) return 1;
      return a[0].localeCompare(b[0]);
    });

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      if (entry === undefined) continue;
      const [name, value] = entry;
      const isLast = i === entries.length - 1;
      const connector = isLast ? '\u2514\u2500\u2500 ' : '\u251C\u2500\u2500 ';
      const isDir = typeof value === 'object' && value !== null;

      if (isDir) {
        lines.push(`${prefix}${connector}${name}/`);
        walk(value as Record<string, unknown>, prefix + (isLast ? '    ' : '\u2502   '));
      } else {
        lines.push(`${prefix}${connector}${name}`);
      }
    }
  }

  walk(root, '');
  return lines.join('\n');
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
export function installSkillsFromHalide(cwd: string): boolean {
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
    cliSuccess('Installed halide skills to .agents/skills/halide/');
    return true;
  } catch {
    cliWarn('Could not install skills');
    return false;
  }
}

/**
 * Resolve the target project directory.
 *
 * @internal
 * @param projectDir - Explicit directory, or `undefined` to prompt/fallback.
 * @param dryRun - When true, use cwd without prompting.
 * @param yes - When true, use cwd without prompting.
 * @returns The resolved absolute path.
 */
async function resolveProjectDir(
  projectDir: string | undefined,
  dryRun: boolean,
  yes: boolean,
): Promise<string> {
  const cwd = projectDir ?? process.cwd();

  if (projectDir) {
    return path.resolve(projectDir);
  }
  if (dryRun || yes) {
    return cwd;
  }
  const projectPath = await input({
    default: cwd,
    message: 'Project directory?',
  });
  return path.resolve(projectPath);
}

/**
 * Prompt the user for app configuration values.
 *
 * @internal
 * @param yes - When true, return defaults without prompting.
 * @returns Object with `appName` and `port`.
 */
async function promptForAppConfig(yes: boolean): Promise<{
  appName: string;
  port: number;
}> {
  const appName = yes
    ? 'halide-app'
    : await input({
        default: 'halide-app',
        message: 'App name?',
        validate: (value: string): boolean | string => {
          if (/^[a-zA-Z0-9_-]+$/.test(value)) return true;
          return 'App name must contain only letters, numbers, dashes, and underscores';
        },
      });

  const port = yes
    ? 3553
    : Number(
        await input({
          default: '3553',
          message: 'Port?',
          validate: (value: string): boolean | string => {
            const portNum = Number.parseInt(value, 10);
            if (Number.isNaN(portNum) || portNum < 1 || portNum > 65535) {
              return 'Please enter a valid port number (1-65535)';
            }
            return true;
          },
        }),
      );

  return { appName, port };
}

/**
 * Initialize a new Halide project by prompting for project directory, app name, and port.
 *
 * Creates project files (full project structure), writes tsconfig.json,
 * and installs dependencies.
 *
 * When `skillsOnly` is true, only installs skills without interactive prompts.
 * When `dryRun` is true, previews all changes without writing files.
 *
 * @param options - Optional configuration.
 *   Set `skillsOnly` to only install AI skills.
 *   Set `dryRun` to preview changes without writing files.
 *
 *   Set `projectDir` to specify the target directory (non-interactive use).
 *   Set `yes` to accept all defaults without prompts.
 */
export async function init(options?: {
  skillsOnly?: boolean;
  dryRun?: boolean;
  projectDir?: string;
  yes?: boolean;
}): Promise<0 | 1> {
  const { skillsOnly = false, dryRun = false, projectDir, yes = false } = options ?? {};

  const resolvedDir = await resolveProjectDir(projectDir, dryRun, yes);
  const pkgPath = path.join(resolvedDir, 'package.json');

  if (skillsOnly) {
    return handleSkillsOnly(resolvedDir, pkgPath);
  }

  if (dryRun) {
    return handleDryRun(resolvedDir);
  }

  if (!(await validateDirectoryEmpty(resolvedDir))) {
    return 1;
  }

  const config = await promptForAppConfig(yes);
  const createdPkg = await createPackageIfMissing(resolvedDir, pkgPath, config);
  writeTsconfigServer(resolvedDir);
  await installDependencies(createdPkg, resolvedDir);
  writeProjectFiles(resolvedDir, config);

  cliLog('\nDone! Next steps:');
  cliLog('  1. Edit your routes in src/routes/');
  cliLog('  2. Run your server with: npm run serve');
  return 0;
}

async function handleSkillsOnly(resolvedDir: string, pkgPath: string): Promise<0 | 1> {
  if (!fs.existsSync(pkgPath)) {
    cliWarn('No package.json found in project directory. Run this in a Node.js project.');
    return 1;
  }
  installSkillsFromHalide(resolvedDir);
  return 0;
}

function handleDryRun(resolvedDir: string): 0 {
  cliInfo('[dry-run] Skipping interactive prompts');
  cliInfo(`Project directory: ${resolvedDir}`);
  const files = generateFullProject('my-app', 3553);
  const allFiles = [...Object.keys(files), 'tsconfig.json', 'package.json', 'nodemon.json'];
  cliTree(renderFileTree(allFiles));
  return 0;
}

async function validateDirectoryEmpty(dir: string): Promise<boolean> {
  if (fs.existsSync(dir)) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    if (entries.length > 0) {
      cliWarn(`Directory '${dir}' is not empty. Aborting.`);
      return false;
    }
  }
  return true;
}

async function createPackageIfMissing(
  resolvedDir: string,
  pkgPath: string,
  config: { appName: string; port: number },
): Promise<boolean> {
  if (!fs.existsSync(resolvedDir)) {
    fs.mkdirSync(resolvedDir, { recursive: true });
  }

  if (!fs.existsSync(pkgPath)) {
    fs.writeFileSync(pkgPath, generatePackageJson(config.appName, halideVersion), 'utf8');
    cliSuccess('Created package.json');

    fs.writeFileSync(path.join(resolvedDir, 'nodemon.json'), generateNodemonJson(), 'utf8');
    cliSuccess('Created nodemon.json');
    return true;
  }
  return false;
}

async function installDependencies(createdPkg: boolean, resolvedDir: string): Promise<void> {
  const installSpinner = ora(
    createdPkg ? 'Installing dependencies...' : 'Installing halide...',
  ).start();
  try {
    if (createdPkg) {
      runQuietly('npm install', resolvedDir);
    } else {
      runQuietly('npm install halide && npm install -D @types/node', resolvedDir);
    }
    installSpinner.succeed();
  } catch (err: unknown) {
    installSpinner.fail('Installation failed');
    throw err;
  }
}

function writeProjectFiles(resolvedDir: string, config: { appName: string; port: number }): void {
  const files = generateFullProject(config.appName, config.port);
  for (const [fp, content] of Object.entries(files)) {
    const fullPath = path.join(resolvedDir, fp);
    if (!fs.existsSync(fullPath)) {
      const dirPath = path.dirname(fullPath);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
      fs.writeFileSync(fullPath, content, 'utf8');
    } else {
      cliInfo(`Skipping existing file: ${fp}`);
    }
  }
}
