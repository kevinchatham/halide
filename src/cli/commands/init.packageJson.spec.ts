import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addScriptsToPackageJson } from './init';

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

describe('addScriptsToPackageJson', () => {
  const projectDir = '/fake/project';

  beforeEach(() => {
    vi.stubEnv('PATH', '/usr/bin');
    process.cwd = (): string => projectDir;
    mockExecSync.mockReturnValue(Buffer.from(''));
  });

  afterEach(() => {
    process.cwd = originalCwd;
    vi.clearAllMocks();
  });

  it('adds both scripts when scripts object exists but halide scripts are missing', () => {
    mockReadFileSync.mockImplementation((p: string) => {
      if (p.endsWith('package.json')) return '{"version":"0.0.0","scripts":{"test":"vitest"}}';
      return '';
    });
    mockExistsSync.mockReturnValue(true);

    addScriptsToPackageJson(projectDir);

    expect(mockWriteFileSync).toHaveBeenCalledWith(
      path.join(projectDir, 'package.json'),
      expect.stringContaining('"halide:start"'),
      'utf8',
    );
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      path.join(projectDir, 'package.json'),
      expect.stringContaining('"halide:build"'),
      'utf8',
    );
  });

  it('adds both scripts when scripts object does not exist', () => {
    mockReadFileSync.mockImplementation((p: string) => {
      if (p.endsWith('package.json')) return '{"version":"0.0.0"}';
      return '';
    });
    mockExistsSync.mockReturnValue(true);

    addScriptsToPackageJson(projectDir);

    const written = mockWriteFileSync.mock.calls.find((c: unknown[]) =>
      String(c[0]).endsWith('package.json'),
    );
    expect(written).toBeDefined();
    const parsed = JSON.parse(written![1] as string) as Record<string, unknown>;
    expect(parsed.scripts).toEqual({
      'halide:build': 'tsc --project tsconfig.server.json',
      'halide:start': 'npm run halide:build && node dist/server.js',
    });
  });

  it('skips when both scripts already exist', () => {
    mockReadFileSync.mockImplementation((p: string) => {
      if (p.endsWith('package.json'))
        return '{"version":"0.0.0","scripts":{"halide:start":"npm run halide:build && node dist/server.js","halide:build":"tsc --project tsconfig.server.json"}}';
      return '';
    });
    mockExistsSync.mockReturnValue(true);

    addScriptsToPackageJson(projectDir);

    const writeCall = mockWriteFileSync.mock.calls.find((c: unknown[]) =>
      String(c[0]).endsWith('package.json'),
    );
    expect(writeCall).toBeUndefined();
  });

  it('adds only missing script when one exists', () => {
    mockReadFileSync.mockImplementation((p: string) => {
      if (p.endsWith('package.json'))
        return '{"version":"0.0.0","scripts":{"halide:start":"npm run halide:build && node dist/server.js"}}';
      return '';
    });
    mockExistsSync.mockReturnValue(true);

    addScriptsToPackageJson(projectDir);

    const written = mockWriteFileSync.mock.calls.find((c: unknown[]) =>
      String(c[0]).endsWith('package.json'),
    );
    expect(written).toBeDefined();
    const parsed = JSON.parse(written![1] as string) as Record<string, unknown>;
    const scripts = parsed.scripts as Record<string, string>;
    expect(scripts['halide:start']).toBe('npm run halide:build && node dist/server.js');
    expect(scripts['halide:build']).toBe('tsc --project tsconfig.server.json');
  });

  it('creates scripts object if package.json has no scripts field', () => {
    mockReadFileSync.mockImplementation((p: string) => {
      if (p.endsWith('package.json')) return '{"version":"0.0.0","name":"my-app"}';
      return '';
    });
    mockExistsSync.mockReturnValue(true);

    addScriptsToPackageJson(projectDir);

    const written = mockWriteFileSync.mock.calls.find((c: unknown[]) =>
      String(c[0]).endsWith('package.json'),
    );
    expect(written).toBeDefined();
    const parsed = JSON.parse(written![1] as string) as Record<string, unknown>;
    expect(parsed.scripts).toBeDefined();
    expect((parsed.scripts as Record<string, string>)['halide:start']).toBe(
      'npm run halide:build && node dist/server.js',
    );
    expect((parsed.scripts as Record<string, string>)['halide:build']).toBe(
      'tsc --project tsconfig.server.json',
    );
  });
});
