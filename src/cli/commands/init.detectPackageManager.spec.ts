import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { detectPackageManager } from './init';

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

describe('detectPackageManager', () => {
  it('detects pnpm from pnpm-lock.yaml', () => {
    mockExistsSync.mockImplementation((p: string) => p.endsWith('pnpm-lock.yaml'));
    expect(detectPackageManager('/project')).toBe('pnpm');
  });

  it('detects yarn from yarn.lock', () => {
    mockExistsSync.mockImplementation((p: string) => p.endsWith('yarn.lock'));
    expect(detectPackageManager('/project')).toBe('yarn');
  });

  it('detects bun from bun.lock', () => {
    mockExistsSync.mockImplementation((p: string) => p.endsWith('bun.lock'));
    expect(detectPackageManager('/project')).toBe('bun');
  });

  it('detects bun from bun.lockb', () => {
    mockExistsSync.mockImplementation((p: string) => p.endsWith('bun.lockb'));
    expect(detectPackageManager('/project')).toBe('bun');
  });

  it('defaults to npm when no lockfile found', () => {
    mockExistsSync.mockReturnValue(false);
    expect(detectPackageManager('/project')).toBe('npm');
  });

  it('prefers bun.lock over bun.lockb when both exist', () => {
    const calls: string[] = [];
    mockExistsSync.mockImplementation((p: string) => {
      calls.push(p);
      return p.endsWith('bun.lock') || p.endsWith('bun.lockb');
    });
    const result = detectPackageManager('/project');
    expect(result).toBe('bun');
    const bunLockIdx = calls.findIndex((p) => p.endsWith(path.join('', 'bun.lock')));
    expect(bunLockIdx).toBeGreaterThanOrEqual(0);
    expect(calls.length).toBe(bunLockIdx + 1);
  });
});
