import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { init } from './init';
import { generateServerTs } from './init.template';

const mockExecSync: ReturnType<typeof vi.fn> = vi.hoisted(() => vi.fn());
const mockExistsSync: ReturnType<typeof vi.fn> = vi.hoisted(() => vi.fn());
const mockWriteFileSync: ReturnType<typeof vi.fn> = vi.hoisted(() => vi.fn());
const mockReadFileSync: ReturnType<typeof vi.fn> = vi.hoisted(() => vi.fn());
const mockAppendFileSync: ReturnType<typeof vi.fn> = vi.hoisted(() => vi.fn());
const mockInput: ReturnType<typeof vi.fn> = vi.hoisted(() => vi.fn());
const mockConfirm: ReturnType<typeof vi.fn> = vi.hoisted(() => vi.fn());
const mockSelect: ReturnType<typeof vi.fn> = vi.hoisted(() => vi.fn());
const mockCpSync: ReturnType<typeof vi.fn> = vi.hoisted(() => vi.fn());
const mockMkdirSync: ReturnType<typeof vi.fn> = vi.hoisted(() => vi.fn());
const mockResolve: ReturnType<typeof vi.fn> = vi.hoisted(() => vi.fn());
const mockReaddirSync: ReturnType<typeof vi.fn> = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', () => ({
  execSync: mockExecSync,
}));

vi.mock('node:fs', () => {
  const mocks = {
    appendFileSync: mockAppendFileSync,
    cpSync: mockCpSync,
    existsSync: mockExistsSync,
    mkdirSync: mockMkdirSync,
    readdirSync: mockReaddirSync,
    readFileSync: mockReadFileSync,
    writeFileSync: mockWriteFileSync,
  };
  return {
    ...mocks,
    default: mocks,
  };
});

vi.mock('node:path', async (importOriginal) => {
  const actual = await importOriginal();
  const typedActual = actual as Record<string, unknown>;
  return {
    ...typedActual,
    default: actual,
    dirname: vi.fn(),
  };
});

vi.mock('node:module', async (importOriginal) => {
  const actual = await importOriginal();
  const typedActual = actual as Record<string, unknown>;
  return {
    ...typedActual,
    createRequire: vi.fn(() => ({ resolve: mockResolve })),
    default: actual,
  };
});

vi.mock('@inquirer/prompts', () => ({
  confirm: mockConfirm,
  input: mockInput,
  select: mockSelect,
}));

const originalCwd: () => string = process.cwd;

describe('init', () => {
  const projectDir = '/fake/project';

  beforeEach(() => {
    vi.stubEnv('PATH', '/usr/bin');
    process.cwd = (): string => projectDir;
    mockExecSync.mockReturnValue(Buffer.from(''));
    mockReadFileSync.mockImplementation((p: string) => {
      if (p.endsWith('package.json')) return '{"version":"0.0.0","scripts":{}}';
      if (p.endsWith('tsconfig.json'))
        return '{"files":[],"references":[{"path":"./tsconfig.app.json"}]}';
      if (p.endsWith('tsconfig.app.json'))
        return '{"compilerOptions":{"types":[]},"exclude":["src/**/*.spec.ts"]}';
      return '{"version":"0.0.0"}';
    });
    mockInput.mockImplementation((opts) => {
      if (opts.message.includes('Project directory')) return projectDir;
      if (opts.message.includes('port')) return '3553';
      return 'my-app';
    });
    mockSelect.mockResolvedValue('single');
    mockConfirm.mockResolvedValue(true);
  });

  afterEach(() => {
    process.cwd = originalCwd;
    vi.clearAllMocks();
  });

  it('returns 1 if no package.json found', async () => {
    mockExistsSync.mockReturnValue(false);

    const result = await init();

    expect(result).toBe(1);
  });

  it('installs halide with detected package manager', async () => {
    mockExistsSync.mockImplementation((p: string) => {
      if (p.endsWith('package.json')) return true;
      if (p.endsWith('server.ts')) return false;
      return false;
    });

    await init();

    expect(mockExecSync).toHaveBeenCalledWith(
      'npm install halide && npm install -D @types/node',
      expect.objectContaining({ cwd: projectDir, stdio: 'pipe' }),
    );
  });

  it('creates server.ts with user-provided app name', async () => {
    mockExistsSync.mockImplementation((p: string) => {
      if (p.endsWith('package.json')) return true;
      if (p.endsWith('server.ts')) return false;
      return false;
    });
    mockInput.mockImplementation((opts) => {
      if (opts.message.includes('Project directory')) return projectDir;
      if (/port/i.test(opts.message)) return '3553';
      return 'my-custom-app';
    });

    await init();

    expect(mockWriteFileSync).toHaveBeenCalledWith(
      path.join(projectDir, 'server.ts'),
      generateServerTs('my-custom-app', 3553),
      'utf8',
    );
  });

  it('rejects app names with invalid characters', async () => {
    mockExistsSync.mockImplementation((p: string) => {
      if (p.endsWith('package.json')) return true;
      return false;
    });
    let nameValidate: (value: string) => string | boolean = () => true;
    mockInput.mockImplementation((opts) => {
      if (!/port/i.test(opts.message) && opts.validate) nameValidate = opts.validate;
      return Promise.resolve(/port/i.test(opts.message) ? '3553' : 'my-app');
    });

    await init();

    expect(nameValidate('my-app')).toBe(true);
    expect(nameValidate('My_App-123')).toBe(true);
    expect(typeof nameValidate('hello world')).toBe('string');
    expect(typeof nameValidate('app.name')).toBe('string');
    expect(typeof nameValidate("app'; import")).toBe('string');
  });

  it('does not overwrite existing server.ts', async () => {
    mockExistsSync.mockImplementation((p: string) => {
      if (p.endsWith('package.json')) return true;
      if (p.endsWith('server.ts')) return true;
      return false;
    });

    await init();

    const serverWriteCall = mockWriteFileSync.mock.calls.find((c: unknown[]) =>
      String(c[0]).endsWith('server.ts'),
    );
    expect(serverWriteCall).toBeUndefined();
  });

  it('copies skills from node_modules/halide to .agents/skills/halide', async () => {
    mockExistsSync.mockImplementation((p: string) => {
      if (p.endsWith('package.json')) return true;
      if (p.endsWith('server.ts')) return false;
      return false;
    });

    mockResolve.mockReturnValue('/fake/project/node_modules/halide/index.js');
    mockReaddirSync.mockReturnValue([
      { isDirectory: () => false, name: 'SKILL.md' },
      { isDirectory: () => true, name: 'subdir' },
    ]);

    await init();

    expect(mockMkdirSync).toHaveBeenCalled();
    expect(mockCpSync).toHaveBeenCalled();
  });

  it('detects pnpm and uses pnpm add', async () => {
    mockExistsSync.mockImplementation((p: string) => {
      if (p.endsWith('package.json')) return true;
      if (p.endsWith('pnpm-lock.yaml')) return true;
      if (p.endsWith('server.ts')) return false;
      return false;
    });

    await init();

    expect(mockExecSync).toHaveBeenCalledWith(
      'pnpm add halide && pnpm add -D @types/node',
      expect.objectContaining({ cwd: projectDir, stdio: 'pipe' }),
    );
  });

  it('skips all setup except skill installation when skillsOnly is true', async () => {
    mockExistsSync.mockImplementation((p: string) => {
      if (p.endsWith('package.json')) return true;
      if (p.endsWith('server.ts')) return false;
      return false;
    });

    mockResolve.mockReturnValue('/fake/project/node_modules/halide/index.js');
    mockReaddirSync.mockReturnValue([{ isDirectory: () => false, name: 'SKILL.md' }]);

    await init({ skillsOnly: true });

    expect(mockExecSync).not.toHaveBeenCalled();
    expect(mockWriteFileSync).not.toHaveBeenCalled();
    expect(mockMkdirSync).toHaveBeenCalled();
    expect(mockCpSync).toHaveBeenCalled();
  });

  it('returns 1 in skillsOnly mode if no package.json', async () => {
    mockExistsSync.mockReturnValue(false);

    const result = await init({ skillsOnly: true });

    expect(result).toBe(1);
  });

  it('skips interactive prompts when dryRun is true', async () => {
    mockExistsSync.mockImplementation((p: string) => {
      if (p.endsWith('package.json')) return true;
      if (p.endsWith('server.ts')) return false;
      if (p.endsWith('tsconfig.server.json')) return false;
      return false;
    });

    await init({ dryRun: true });

    expect(mockInput).not.toHaveBeenCalled();
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it('does not install halide when dryRun is true', async () => {
    mockExistsSync.mockImplementation((p: string) => {
      if (p.endsWith('package.json')) return true;
      if (p.endsWith('server.ts')) return false;
      if (p.endsWith('tsconfig.server.json')) return false;
      return false;
    });

    await init({ dryRun: true });

    expect(mockExecSync).not.toHaveBeenCalled();
  });

  it('creates full project structure when projectType is full', async () => {
    mockExistsSync.mockImplementation((p: string) => {
      if (p.endsWith('package.json')) return true;
      if (p.endsWith('server.ts')) return false;
      return false;
    });
    mockSelect.mockResolvedValue('full');
    mockResolve.mockReturnValue('/fake/project/node_modules/halide/index.js');
    mockReaddirSync.mockReturnValue([{ isDirectory: () => false, name: 'SKILL.md' }]);

    await init();

    const writtenFiles = mockWriteFileSync.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(writtenFiles).toContain(path.join(projectDir, 'src/halide/builder.ts'));
    expect(writtenFiles).toContain(path.join(projectDir, 'src/halide/types.ts'));
    expect(writtenFiles).toContain(path.join(projectDir, 'src/routes/health.ts'));
    expect(writtenFiles).toContain(path.join(projectDir, 'src/routes/index.ts'));
    expect(writtenFiles).toContain(path.join(projectDir, 'src/server.ts'));
    expect(writtenFiles).toContain(path.join(projectDir, 'tsconfig.server.json'));
    expect(mockExecSync).toHaveBeenCalledWith(
      'npm install halide && npm install -D @types/node',
      expect.anything(),
    );
  });

  it('creates full project structure with user-provided app name and port', async () => {
    mockExistsSync.mockImplementation((p: string) => {
      if (p.endsWith('package.json')) return true;
      if (p.endsWith('server.ts')) return false;
      return false;
    });
    mockSelect.mockResolvedValue('full');
    mockResolve.mockReturnValue('/fake/project/node_modules/halide/index.js');
    mockReaddirSync.mockReturnValue([{ isDirectory: () => false, name: 'SKILL.md' }]);
    mockInput.mockImplementation((opts) => {
      if (opts.message.includes('Project directory')) return projectDir;
      if (/port/i.test(opts.message)) return '8080';
      return 'my-full-app';
    });

    await init();

    const serverWriteCall = mockWriteFileSync.mock.calls.find((c: unknown[]) =>
      String(c[0]).endsWith('src/server.ts'),
    );
    expect(serverWriteCall).toBeDefined();
    expect(String(serverWriteCall![1])).toContain("name: 'my-full-app'");
    expect(String(serverWriteCall![1])).toContain('port: 8080');
  });

  it('skips all prompts when yes is true', async () => {
    mockExistsSync.mockImplementation((p: string) => {
      if (p.endsWith('package.json')) return true;
      if (p.endsWith('server.ts')) return false;
      return false;
    });

    await init({ yes: true });

    expect(mockInput).not.toHaveBeenCalled();
    expect(mockSelect).not.toHaveBeenCalled();
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it('uses default values when yes is true', async () => {
    mockExistsSync.mockImplementation((p: string) => {
      if (p.endsWith('package.json')) return true;
      if (p.endsWith('server.ts')) return false;
      return false;
    });
    mockResolve.mockReturnValue('/fake/project/node_modules/halide/index.js');
    mockReaddirSync.mockReturnValue([{ isDirectory: () => false, name: 'SKILL.md' }]);

    await init({ yes: true });

    const serverWriteCall = mockWriteFileSync.mock.calls.find((c: unknown[]) =>
      String(c[0]).endsWith('server.ts'),
    );
    expect(serverWriteCall).toBeDefined();
    expect(String(serverWriteCall![1])).toContain("name: 'halide-app'");
    expect(String(serverWriteCall![1])).toContain('port: 3553');
  });

  it('returns 0 on success', async () => {
    mockExistsSync.mockImplementation((p: string) => {
      if (p.endsWith('package.json')) return true;
      if (p.endsWith('server.ts')) return false;
      return false;
    });
    mockResolve.mockReturnValue('/fake/project/node_modules/halide/index.js');
    mockReaddirSync.mockReturnValue([{ isDirectory: () => false, name: 'SKILL.md' }]);

    const result = await init({ yes: true });

    expect(result).toBe(0);
  });

  it('skips prompts when yes is true in dryRun mode', async () => {
    mockExistsSync.mockImplementation((p: string) => {
      if (p.endsWith('package.json')) return true;
      if (p.endsWith('server.ts')) return false;
      return false;
    });

    await init({ dryRun: true, yes: true });

    expect(mockInput).not.toHaveBeenCalled();
    expect(mockConfirm).not.toHaveBeenCalled();
  });
});
