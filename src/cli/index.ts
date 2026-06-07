/**
 * Halide CLI entry point.
 *
 * Bootstraps the Commander.js program with the `init` command for scaffolding
 * new Halide BFF (Backend For Frontend) projects. Reads the package version
 * from `package.json` and wires up CLI options to the `init` command handler.
 *
 * @example
 *   npx halide init                    // Interactive project creation
 *   npx halide init --yes              // Non-interactive with defaults
 *   npx halide init --dry-run          // Preview changes without writing
 *   npx halide init --skills-only      // Only install AI skills
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import { init } from './commands/init.js';

const pkgPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));

const program = new Command();

program
  .name('halide')
  .description('Initialize and manage Halide BFF projects')
  .version(pkg.version);

program
  .command('init')
  .description('Scaffold a new Halide project')
  .option('--dry-run', 'Preview changes without writing files')
  .option('--project-dir <path>', 'Target directory (skip prompt)')
  .option('--skills-only', 'Only install AI skills')
  .option('-y, --yes', 'Accept all defaults (non-interactive)')
  .action(async (options) => {
    try {
      const exitCode = await init({
        dryRun: options.dryRun,
        projectDir: options.projectDir,
        skillsOnly: options.skillsOnly,
        yes: options.yes,
      });
      process.exit(exitCode);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(`\nFatal error: ${message}\n`);
      process.exit(1);
    }
  });

await program.parseAsync(process.argv);
