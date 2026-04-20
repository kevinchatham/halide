import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'tsup';

const pkg = JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as { version: string };

export default defineConfig([
  {
    clean: true,
    dts: true,
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    outDir: 'dist',
    splitting: false,
  },
  {
    banner: {
      js: '#!/usr/bin/env node',
    },
    clean: true,
    define: {
      HALIDE_VERSION: JSON.stringify(pkg.version),
    },
    entry: ['src/cli/index.ts'],
    format: ['esm'],
    outDir: 'dist/cli',
    splitting: false,
  },
]);
