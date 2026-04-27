import { afterEach, describe, expect, it, vi } from 'vitest';
import { runQuietly } from './init';

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

const _originalCwd: () => string = process.cwd;

describe('runQuietly', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('calls execSync with stdio pipe', () => {
    mockExecSync.mockReturnValue(Buffer.from('ok'));

    runQuietly('echo hello', '/tmp');

    expect(mockExecSync).toHaveBeenCalledWith('echo hello', {
      cwd: '/tmp',
      stdio: 'pipe',
    });
  });

  it('prints stderr and re-throws on failure', () => {
    const stderrOutput = 'command failed\n';
    const err = new Error('fail') as Error & { stderr: Buffer };
    err.stderr = Buffer.from(stderrOutput);
    mockExecSync.mockImplementation(() => {
      throw err;
    });
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    expect(() => runQuietly('bad-cmd', '/tmp')).toThrow('fail');
    expect(stderrSpy).toHaveBeenCalledWith(stderrOutput);

    stderrSpy.mockRestore();
  });

  it('re-throws even when error has no stderr', () => {
    mockExecSync.mockImplementation(() => {
      throw new Error('no stderr');
    });

    expect(() => runQuietly('bad-cmd', '/tmp')).toThrow('no stderr');
  });
});
