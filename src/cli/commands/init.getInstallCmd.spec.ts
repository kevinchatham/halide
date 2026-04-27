import { describe, expect, it, vi } from 'vitest';
import { getInstallCmd } from './init';

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

describe('getInstallCmd', () => {
  it('returns correct npm command', () => {
    expect(getInstallCmd('npm')).toBe('npm install halide && npm install -D @types/node');
  });

  it('returns correct pnpm command', () => {
    expect(getInstallCmd('pnpm')).toBe('pnpm add halide && pnpm add -D @types/node');
  });

  it('returns correct yarn command', () => {
    expect(getInstallCmd('yarn')).toBe('yarn add halide && yarn add -D @types/node');
  });

  it('returns correct bun command', () => {
    expect(getInstallCmd('bun')).toBe('bun add halide && bun add -D @types/node');
  });
});
