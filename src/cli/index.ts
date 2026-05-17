import process from 'node:process';
import { parseArgs } from 'node:util';
import { init } from './commands/init';

type Args = {
  positionals: string[];
  values: {
    'skills-only'?: boolean;
    'dry-run'?: boolean;
    force?: boolean;
    'project-dir'?: string;
    'project-type'?: string;
  };
};

const { positionals, values }: Args = parseArgs({
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
    'project-dir': {
      type: 'string',
    },
    'project-type': {
      type: 'string',
    },
    'skills-only': {
      default: false,
      type: 'boolean',
    },
  },
});

const command: string | undefined = positionals[0];

if (command === 'init') {
  const projectTypeRaw = values['project-type'];
  if (projectTypeRaw !== undefined && !['full', 'single'].includes(projectTypeRaw)) {
    process.stderr.write(
      `Error: Invalid project type "${projectTypeRaw}". Must be "full" or "single".\n`,
    );
    process.exit(1);
  }
  await init({
    dryRun: values['dry-run'],
    force: values.force,
    projectDir: values['project-dir'],
    projectType: projectTypeRaw as 'full' | 'single' | undefined,
    skillsOnly: values['skills-only'],
  });
} else {
  process.stderr.write(`Usage: halide init\n`);
  process.exit(1);
}
