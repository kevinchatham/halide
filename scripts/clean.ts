/**
 * Build script: removes common generated and cache directories.
 *
 * Deletes `.scannerwork`, `dist`, `coverage`, `node_modules`, and
 * `package-lock.json` files matching the configured glob patterns.
 * Runs as an unconditional side-effect when executed (`npx tsx scripts/clean.ts`).
 */
import { rmSync } from 'node:fs';
import { glob } from 'glob';

const patterns: string[] = [
  '.scannerwork',
  '**/dist',
  '**/package-lock.json',
  'coverage',
  'node_modules',
];

await Promise.all(
  patterns.map(async (pattern) => {
    const files = await glob(pattern, { dot: true });
    for (const f of files) {
      try {
        rmSync(f, { force: true, recursive: true });
      } catch (err) {
        // biome-ignore lint/suspicious/noConsole: script error reporting
        console.error(`Failed to remove ${f}:`, err);
      }
    }
  }),
);
