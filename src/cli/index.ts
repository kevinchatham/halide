import process from 'node:process';
import { parseArgs } from 'node:util';
import { init } from './commands/init';

const {
  positionals,
  values,
}: {
  positionals: string[];
  values: { 'skills-only'?: boolean; 'dry-run'?: boolean; force?: boolean };
} = parseArgs({
  allowPositionals: true,
  options: {
    'dry-run': {
      default: false,
      type: 'boolean',
    },
    force: {
      default: false,
      type: 'boolean',
    },
    'skills-only': {
      default: false,
      type: 'boolean',
    },
  },
});

const command: string | undefined = positionals[0];

if (command === 'init') {
  await init({
    dryRun: values['dry-run'],
    force: values.force,
    skillsOnly: values['skills-only'],
  });
} else {
  process.stderr.write(`Usage: halide init\n`);
  process.exit(1);
}
