import { rm } from 'node:fs/promises';
import { glob } from 'glob';

const patterns = [
  '**/.angular',
  '**/dist',
  '**/package-lock.json',
  'demo/**/node_modules',
  'node_modules',
];

Promise.all(
  patterns.map(async (pattern) => {
    const files = await glob(pattern, { dot: true });
    await Promise.all(
      files.map((f) =>
        rm(f, { recursive: true, force: true }).catch((err) => {
          console.error(`Failed to remove ${f}:`, err.message);
        })
      )
    );
  })
).catch(() => {});
