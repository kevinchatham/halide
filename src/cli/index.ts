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
  .option('--force', 'Overwrite existing files')
  .option('--project-dir <path>', 'Target directory (skip prompt)')
  .option('--project-type <type>', 'Project type: full (multi-file) or single', (val) => {
    if (!['full', 'single'].includes(val)) {
      throw new Error('Must be "full" or "single"');
    }
    return val;
  })
  .option('--skills-only', 'Only install AI skills')
  .option('-y, --yes', 'Accept all defaults (non-interactive)')
  .action(async (options) => {
    try {
      const exitCode = await init({
        dryRun: options.dryRun,
        force: options.force,
        projectDir: options.projectDir,
        projectType: options.projectType,
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
