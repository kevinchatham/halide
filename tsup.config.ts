import { readFileSync } from 'node:fs';
import { defineConfig } from 'tsup';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

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
      __PKG_VERSION__: `'${pkg.version}'`,
    },
    entry: ['src/cli/index.ts'],
    format: ['esm'],
    outDir: 'dist/cli',
    splitting: false,
  },
]);
