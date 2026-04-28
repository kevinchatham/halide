import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateServerTs, init } from './init';

const mockExecSync: ReturnType<typeof vi.fn> = vi.hoisted(() => vi.fn());
const mockExistsSync: ReturnType<typeof vi.fn> = vi.hoisted(() => vi.fn());
const mockWriteFileSync: ReturnType<typeof vi.fn> = vi.hoisted(() => vi.fn());
const mockReadFileSync: ReturnType<typeof vi.fn> = vi.hoisted(() => vi.fn());
const mockAppendFileSync: ReturnType<typeof vi.fn> = vi.hoisted(() => vi.fn());
const mockInput: ReturnType<typeof vi.fn> = vi.hoisted(() => vi.fn());
const mockConfirm: ReturnType<typeof vi.fn> = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', () => ({
  execSync: mockExecSync,
}));

vi.mock('node:fs', () => {
  const mocks = {
    appendFileSync: mockAppendFileSync,
    existsSync: mockExistsSync,
    readFileSync: mockReadFileSync,
    writeFileSync: mockWriteFileSync,
  };
  return {
    ...mocks,
    default: mocks,
  };
});

vi.mock('@inquirer/prompts', () => ({
  confirm: mockConfirm,
  input: mockInput,
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
    mockInput.mockImplementation((opts) =>
      Promise.resolve(opts.message.includes('port') ? '3553' : 'my-app'),
    );
    mockConfirm.mockResolvedValue(true);
  });

  afterEach(() => {
    process.cwd = originalCwd;
    vi.clearAllMocks();
  });

  it('exits if no package.json found', async () => {
    mockExistsSync.mockReturnValue(false);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    await init();

    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
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
    mockInput.mockImplementation((opts) =>
      Promise.resolve(opts.message.includes('port') ? '3553' : 'my-custom-app'),
    );

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
      if (!opts.message.includes('port') && opts.validate) nameValidate = opts.validate;
      return Promise.resolve(opts.message.includes('port') ? '3553' : 'my-app');
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

  it('runs skills add interactively with stdio inherit', async () => {
    mockExistsSync.mockImplementation((p: string) => {
      if (p.endsWith('package.json')) return true;
      if (p.endsWith('server.ts')) return false;
      return false;
    });

    await init();

    expect(mockExecSync).toHaveBeenCalledWith('npx skills add kevinchatham/halide', {
      cwd: projectDir,
      stdio: 'inherit',
    });
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
});
