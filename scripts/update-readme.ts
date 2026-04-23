import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const root = join(__dirname, '..');

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));
const version = pkg.version as string;

const readmePath = join(root, 'README.md');
const readme = readFileSync(readmePath, 'utf-8');

const newContent = readme.replace(
  /https:\/\/img\.shields\.io\/badge\/docs-\d+\.\d+\.\d+-cyan/,
  `https://img.shields.io/badge/docs-${version}-cyan`,
);

writeFileSync(readmePath, newContent, 'utf-8');
