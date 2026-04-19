import { rmSync } from 'node:fs';
import { glob } from 'glob';

const patterns: string[] = [
  '**/.angular',
  '**/dist',
  '**/package-lock.json',
  'coverage',
  'demo/**/node_modules',
  'node_modules',
];

Promise.all(
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
).catch(() => {});
