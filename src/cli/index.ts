import process from 'node:process';
import { parseArgs } from 'node:util';
import { init } from './commands/init.js';

const { positionals, values }: { positionals: string[]; values: { 'skills-only'?: boolean } } =
  parseArgs({
    allowPositionals: true,
    options: {
      'skills-only': {
        default: false,
        type: 'boolean',
      },
    },
  });

const command: string | undefined = positionals[0];

if (command === 'init') {
  await init({ skillsOnly: values['skills-only'] });
} else {
  process.stderr.write(`Usage: halide init\n`);
  process.exit(1);
}
