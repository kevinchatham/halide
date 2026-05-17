import { execSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { confirm, input, select } from '@inquirer/prompts';
import { applyEdits, parse as jsoncParse, modify } from 'jsonc-parser';
import ora from 'ora';
import { cliInfo, cliLog, cliSuccess, cliWarn } from '../utils/logger.js';
import {
  addServerReference,
  addToTsconfigExclude,
  generateFullProject,
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
 * `halide:start` runs `npm run halide:build && node dist/server.js` (single file)
 * or `npm run halide:build && node dist/src/server.js` (full project).
 * `halide:build` runs `tsc --project tsconfig.server.json`.
 *
 * @param cwd - The project working directory.
 * @param dryRun - When true, logs what would be added without writing files.
 * @param force - When true, overwrites existing scripts regardless.
 * @param fullProject - When true, uses full project script paths.
 */
export function addScriptsToPackageJson(
  cwd: string,
  dryRun = false,
  force = false,
  fullProject = false,
): void {
  const pkgPath = path.join(cwd, 'package.json');
  const raw = fs.readFileSync(pkgPath, 'utf8');

  const startTarget = fullProject ? 'dist/src/server.js' : 'dist/server.js';
  const newStart = `npm run halide:build && node ${startTarget}`;
  const newBuild = 'tsc --project tsconfig.server.json';
  const formattedOptions = { insertSpaces: true, tabSize: 2 };

  if (dryRun) {
    cliInfo('[dry-run] Would add halide:start and halide:build scripts to package.json');
    return;
  }

  const parsed = jsoncParse(raw) as Record<string, unknown>;
  const scripts =
    parsed.scripts && typeof parsed.scripts === 'object'
      ? (parsed.scripts as Record<string, string>)
      : {};

  if (!force && scripts['halide:start'] && scripts['halide:build']) {
    return;
  }

  let result = raw;

  const writeScript = (key: 'halide:start' | 'halide:build', value: string): void => {
    if (!force && scripts[key]) return;
    const modified = modify(result, ['scripts', key], value, {
      formattingOptions: formattedOptions,
    });
    result = applyEdits(result, modified);
  };

  writeScript('halide:start', newStart);
  writeScript('halide:build', newBuild);

  fs.writeFileSync(pkgPath, result, 'utf8');
  cliSuccess('Added halide:start and halide:build scripts to package.json');
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
 * Print a dry-run preview of what would be created.
 *
 * @internal
 * @param resolvedDir - The target project directory.
 * @param projectType - The project type (`'full'` or `'single'`).
 * @param force - When true, overwrites existing files.
 */
function printDryRunPreview(
  resolvedDir: string,
  projectType: 'full' | 'single',
  force: boolean,
): void {
  cliInfo('[dry-run] Skipping interactive prompts');
  cliInfo(`Project directory: ${resolvedDir}`);
  cliInfo(`Project type: ${projectType}`);
  cliInfo('Would install halide');

  if (projectType === 'full') {
    const files = generateFullProject('my-app', 3553);
    cliInfo('Would create:');
    for (const filePath of Object.keys(files)) {
      cliInfo(`  - ${filePath}`);
    }
  } else {
    cliInfo('Would create: server.ts');
  }

  const isFull = projectType === 'full';
  writeTsconfigServer(resolvedDir, true, force, isFull);
  addServerReference(resolvedDir, true, force);
  addToTsconfigExclude(resolvedDir, true, force, isFull ? 'src/server.ts' : 'server.ts');
  addScriptsToPackageJson(resolvedDir, true, force, isFull);
  cliLog('\nDone! (dry-run)');
}

/**
 * Prompt the user for app configuration values.
 *
 * @internal
 * @param yes - When true, return defaults without prompting.
 * @param projectType - Pre-specified project type, or `undefined` to prompt.
 * @returns Object with `appName`, `port`, `selectedProjectType`, and `installSkills`.
 */
async function promptForAppConfig(
  yes: boolean,
  projectType: 'full' | 'single' | undefined,
): Promise<{
  appName: string;
  port: number;
  selectedProjectType: 'full' | 'single';
  installSkills: boolean;
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

  const selectedProjectType: 'full' | 'single' =
    projectType ??
    (yes
      ? 'full'
      : await select({
          choices: [
            { name: 'Full project', value: 'full' },
            { name: 'Single file', value: 'single' },
          ],
          message: 'Project type?',
        }));

  const installSkills = yes
    ? true
    : await confirm({
        default: true,
        message: 'Install AI coding skills for halide?',
      });

  return { appName, installSkills, port, selectedProjectType };
}

/**
 * Install halide via the detected package manager.
 *
 * @internal
 * @param resolvedDir - The target project directory.
 */
function performInstallation(resolvedDir: string): void {
  const pkgManager = detectPackageManager(resolvedDir);
  const installCmd = getInstallCmd(pkgManager);

  const installSpinner = ora('Installing halide...').start();
  try {
    runQuietly(installCmd, resolvedDir);
    installSpinner.succeed();
  } catch (err: unknown) {
    installSpinner.fail('Installation failed');
    throw err;
  }
}

/**
 * Write a single file, creating parent directories and updating spinner text.
 *
 * @internal
 * @param fullPath - Absolute path of the file to write.
 * @param content - File content to write.
 * @param spinner - The ora spinner to update.
 */
function writeFileWithSpinner(
  fullPath: string,
  content: string,
  spinner: ReturnType<typeof ora>,
): void {
  const dirPath = path.dirname(fullPath);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  if (fs.existsSync(fullPath)) {
    spinner.text = `Setting up project files... (${fullPath} exists, skipping)`;
  } else {
    fs.writeFileSync(fullPath, content, 'utf8');
  }
}

/**
 * Generate and write project files, then configure tsconfig and scripts.
 *
 * @internal
 * @param resolvedDir - The target project directory.
 * @param appName - The application name.
 * @param port - The server port.
 * @param selectedProjectType - `'full'` for full project, `'single'` for single file.
 * @param force - When true, overwrites existing files.
 */
function setupProjectFiles(
  resolvedDir: string,
  appName: string,
  port: number,
  selectedProjectType: 'full' | 'single',
  force: boolean,
): void {
  const fileSpinner = ora('Setting up project files...').start();
  try {
    if (selectedProjectType === 'full') {
      const files = generateFullProject(appName, port);
      for (const [fp, content] of Object.entries(files)) {
        const fullPath = path.join(resolvedDir, fp);
        writeFileWithSpinner(fullPath, content, fileSpinner);
      }
    } else {
      const singleServerPath = path.join(resolvedDir, 'server.ts');
      writeFileWithSpinner(singleServerPath, generateServerTs(appName, port), fileSpinner);
    }

    const isFull = selectedProjectType === 'full';
    writeTsconfigServer(resolvedDir, false, force, isFull);
    addServerReference(resolvedDir, false, force);
    addToTsconfigExclude(resolvedDir, false, force, isFull ? 'src/server.ts' : 'server.ts');
    addScriptsToPackageJson(resolvedDir, false, force, isFull);

    fileSpinner.succeed();
  } catch (err: unknown) {
    fileSpinner.fail('Failed to set up project files');
    throw err;
  }
}

/**
 * Initialize a new Halide project by prompting for project directory, app name, port, and project type.
 *
 * Installs halide, creates project files (single file or full project structure),
 * writes tsconfig.server.json, adds scripts to package.json, and optionally
 * installs AI coding skills.
 *
 * When `skillsOnly` is true, only installs skills without interactive prompts.
 * When `dryRun` is true, previews all changes without writing files.
 *
 * @param options - Optional configuration. Set `skillsOnly` to skip project setup.
 *   Set `dryRun` to preview changes without writing files.
 *   Set `force` to overwrite existing files.
 *   Set `projectDir` to specify the target directory (non-interactive use).
 *   Set `yes` to accept all defaults without prompts.
 */
export async function init(options?: {
  skillsOnly?: boolean;
  dryRun?: boolean;
  force?: boolean;
  projectDir?: string;
  projectType?: 'full' | 'single';
  yes?: boolean;
}): Promise<0 | 1> {
  const {
    skillsOnly = false,
    dryRun = false,
    force = false,
    projectDir,
    projectType,
    yes = false,
  } = options ?? {};

  const resolvedDir = await resolveProjectDir(projectDir, dryRun, yes);

  const pkgPath = path.join(resolvedDir, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    cliWarn('No package.json found in project directory. Run this in a Node.js project.');
    return 1;
  }

  if (skillsOnly) {
    installSkillsFromHalide(resolvedDir);
    return 0;
  }

  const effectiveProjectType = projectType ?? 'full';

  if (dryRun) {
    printDryRunPreview(resolvedDir, effectiveProjectType, force);
    return 0;
  }

  if (!fs.existsSync(resolvedDir)) {
    fs.mkdirSync(resolvedDir, { recursive: true });
  }

  const config = await promptForAppConfig(yes, projectType);

  performInstallation(resolvedDir);
  setupProjectFiles(resolvedDir, config.appName, config.port, config.selectedProjectType, force);

  if (config.installSkills) {
    const skillsInstalled = installSkillsFromHalide(resolvedDir);
    if (!skillsInstalled) {
      cliWarn('To install skills manually, copy halide/skill/ to .agents/skills/halide/');
    }
  } else {
    cliSuccess('Skipping skills installation');
  }

  cliLog('\nDone! Next steps:');
  cliLog('  1. Edit your routes in src/routes/ or server.ts');
  cliLog('  2. Run your server with: npm run halide:start');
  return 0;
}
