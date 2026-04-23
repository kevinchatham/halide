import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockInit = vi.hoisted(() => vi.fn());
const mockParseArgs = vi.hoisted(() => vi.fn());

vi.mock('node:util', () => ({
  parseArgs: mockParseArgs,
}));

vi.mock('./commands/init.js', () => ({
  init: mockInit,
}));

describe('CLI entry point', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    mockInit.mockReset();
    mockParseArgs.mockReset();
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    exitSpy.mockRestore();
    stderrSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it('calls init when command is init', async () => {
    mockParseArgs.mockReturnValue({ positionals: ['init'] });
    mockInit.mockResolvedValue(undefined);

    await import('./index.js');

    expect(mockInit).toHaveBeenCalledTimes(1);
    expect(stderrSpy).not.toHaveBeenCalled();
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('writes usage and exits with 1 when command is not init', async () => {
    mockParseArgs.mockReturnValue({ positionals: ['unknown'] });

    await import('./index.js');

    expect(mockInit).not.toHaveBeenCalled();
    expect(stderrSpy).toHaveBeenCalledWith('Usage: halide init\n');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('writes usage and exits with 1 when no command is provided', async () => {
    mockParseArgs.mockReturnValue({ positionals: [] });

    await import('./index.js');

    expect(mockInit).not.toHaveBeenCalled();
    expect(stderrSpy).toHaveBeenCalledWith('Usage: halide init\n');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
