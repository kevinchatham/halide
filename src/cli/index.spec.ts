import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockInit = vi.hoisted(() => vi.fn());
const mockPkg = vi.hoisted(() => ({ name: 'halide', version: '0.0.12' }));

vi.mock('node:fs', () => ({
  readFileSync: (_path: string, _encoding: string) => JSON.stringify(mockPkg),
}));

vi.mock('node:module', () => ({
  createRequire: vi.fn(() => ({
    resolve: (name: string) => name,
  })),
}));

vi.mock('./commands/init.js', () => ({
  init: mockInit,
}));

describe('CLI entry point', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  let parseAsyncMock: ReturnType<typeof vi.fn>;
  let actionCallback: ((options: Record<string, unknown>) => Promise<void>) | null;

  beforeEach(async () => {
    vi.resetModules();
    mockInit.mockReset();
    mockInit.mockResolvedValue(0 as const);
    actionCallback = null;

    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    parseAsyncMock = vi.fn();

    const mockAction = vi.fn(async (cb: (options: Record<string, unknown>) => Promise<void>) => {
      actionCallback = cb;
      return { parseAsync: parseAsyncMock };
    });

    const mockOptionChain = {
      action: mockAction,
      option: vi.fn().mockReturnThis(),
    };

    const mockInitCommand = {
      description: vi.fn().mockReturnValue(mockOptionChain),
    };

    const mockProgramInstance = {
      command: vi.fn().mockReturnValue(mockInitCommand),
      description: vi.fn().mockReturnThis(),
      name: vi.fn().mockReturnThis(),
      parseAsync: parseAsyncMock,
      version: vi.fn().mockReturnThis(),
    };

    const MockCommand = vi.fn(function (this: Record<string, unknown>) {
      return mockProgramInstance;
    });

    vi.doMock('commander', () => ({
      Command: MockCommand,
    }));
  });

  afterEach(() => {
    exitSpy.mockRestore();
    stderrSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it('calls parseAsync with process.argv', async () => {
    await import('./index.js');
    expect(parseAsyncMock).toHaveBeenCalledWith(process.argv);
  });

  it('calls init with all options', async () => {
    await import('./index.js');
    expect(actionCallback).not.toBeNull();

    await actionCallback!({
      dryRun: true,
      force: false,
      projectDir: '/tmp/test',
      projectType: 'full',
      skillsOnly: false,
      yes: true,
    });

    expect(mockInit).toHaveBeenCalledWith({
      dryRun: true,
      force: false,
      projectDir: '/tmp/test',
      projectType: 'full',
      skillsOnly: false,
      yes: true,
    });
  });

  it('calls process.exit with init return code', async () => {
    mockInit.mockResolvedValue(0 as const);
    await import('./index.js');
    expect(actionCallback).not.toBeNull();

    await actionCallback!({});

    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('catches fatal errors and writes to stderr', async () => {
    mockInit.mockRejectedValue(new Error('Something broke'));
    await import('./index.js');
    expect(actionCallback).not.toBeNull();

    await actionCallback!({});

    expect(stderrSpy).toHaveBeenCalledWith('\nFatal error: Something broke\n');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('handles non-Error exceptions', async () => {
    mockInit.mockRejectedValue('string error');
    await import('./index.js');
    expect(actionCallback).not.toBeNull();

    await actionCallback!({});

    expect(stderrSpy).toHaveBeenCalledWith('\nFatal error: string error\n');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
