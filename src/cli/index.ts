import { parseArgs } from 'node:util';
import { init } from './commands/init.js';

const { positionals }: { positionals: string[] } = parseArgs({
  allowPositionals: true,
  options: {},
});

const command: string | undefined = positionals[0];

if (command === 'init') {
  await init();
} else {
  process.stderr.write(`Usage: halide init\n`);
  process.exit(1);
}
