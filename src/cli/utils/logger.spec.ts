import { afterEach, describe, expect, it, vi } from 'vitest';
import { cliInfo, cliLog, cliSuccess, cliWarn } from './logger';

describe('cliLog', () => {
  let spy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    spy.mockRestore();
  });

  it('writes message to stdout with trailing newline', () => {
    cliLog('hello');
    expect(spy).toHaveBeenCalledWith('hello\n');
  });

  it('writes message without adding extra prefix', () => {
    cliLog('✓ Done');
    expect(spy).toHaveBeenCalledWith('✓ Done\n');
  });
});

describe('cliWarn', () => {
  let spy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    spy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    spy.mockRestore();
  });

  it('writes warning to stderr with warning prefix', () => {
    cliWarn('something is wrong');
    expect(spy).toHaveBeenCalledWith('\u26a0 something is wrong\n');
  });
});

describe('cliSuccess', () => {
  let spy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    spy.mockRestore();
  });

  it('writes success to stdout with checkmark prefix', () => {
    cliSuccess('Done');
    expect(spy).toHaveBeenCalledWith('\u2713 Done\n');
  });
});

describe('cliInfo', () => {
  let spy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    spy.mockRestore();
  });

  it('writes info to stdout with info prefix', () => {
    cliInfo('dry-run mode');
    expect(spy).toHaveBeenCalledWith('\u2139 dry-run mode\n');
  });
});
