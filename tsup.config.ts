import { defineConfig } from 'tsup';

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
    entry: ['src/cli/index.ts'],
    format: ['esm'],
    outDir: 'dist/cli',
    splitting: false,
  },
]);
