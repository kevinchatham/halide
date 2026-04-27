import { describe, expect, it, vi } from 'vitest';
import { generateServerTs } from './init';

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

describe('generateServerTs', () => {
  it('generates server.ts with given spa name and port', () => {
    const result = generateServerTs('my-custom-app', 8080);
    expect(result).toContain("name: 'my-custom-app'");
    expect(result).toContain('port: 8080');
    expect(result).toContain("import { createServer, apiRoute } from 'halide'");
  });

  it('generates server.ts with default spa name', () => {
    const result = generateServerTs('my-app', 3553);
    expect(result).toContain("name: 'my-app'");
    expect(result).toContain('port: 3553');
  });
});
