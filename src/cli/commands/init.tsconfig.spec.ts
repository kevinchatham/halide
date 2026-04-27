import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { init, TSCONFIG_SERVER } from './init';

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

describe('writeTsconfigServer', () => {
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

  it('creates tsconfig.server.json when it does not exist', async () => {
    mockExistsSync.mockImplementation((p: string) => {
      if (p.endsWith('package.json')) return true;
      if (p.endsWith('server.ts')) return false;
      if (p.endsWith('tsconfig.server.json')) return false;
      return false;
    });

    await init();

    expect(mockWriteFileSync).toHaveBeenCalledWith(
      path.join(projectDir, 'tsconfig.server.json'),
      TSCONFIG_SERVER,
      'utf8',
    );
  });

  it('skips when tsconfig.server.json already exists', async () => {
    mockExistsSync.mockImplementation((p: string) => {
      if (p.endsWith('package.json')) return true;
      if (p.endsWith('server.ts')) return false;
      if (p.endsWith('tsconfig.server.json')) return true;
      return false;
    });

    await init();

    const writeCall = mockWriteFileSync.mock.calls.find((c: unknown[]) =>
      String(c[0]).endsWith('tsconfig.server.json'),
    );
    expect(writeCall).toBeUndefined();
  });
});

describe('addServerReference', () => {
  const projectDir = '/fake/project';

  beforeEach(() => {
    vi.stubEnv('PATH', '/usr/bin');
    process.cwd = (): string => projectDir;
    mockExecSync.mockReturnValue(Buffer.from(''));
    mockReadFileSync.mockImplementation((p: string) => {
      if (p.endsWith('package.json')) return '{"version":"0.0.0","scripts":{}}';
      if (p.endsWith('tsconfig.json'))
        return '{"files":[],"references":[{"path":"./tsconfig.app.json"}]}';
      return '';
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

  it('appends reference to existing references array', async () => {
    mockExistsSync.mockImplementation((p: string) => {
      if (p.endsWith('package.json')) return true;
      if (p.endsWith('server.ts')) return false;
      if (p.endsWith('tsconfig.server.json')) return false;
      if (p.endsWith('tsconfig.json')) return true;
      return false;
    });

    await init();

    expect(mockWriteFileSync).toHaveBeenCalledWith(
      path.join(projectDir, 'tsconfig.json'),
      expect.stringContaining('./tsconfig.server.json'),
      'utf8',
    );
  });

  it('skips if reference already exists', async () => {
    mockExistsSync.mockImplementation((p: string) => {
      if (p.endsWith('package.json')) return true;
      if (p.endsWith('server.ts')) return false;
      if (p.endsWith('tsconfig.server.json')) return false;
      if (p.endsWith('tsconfig.json')) return true;
      return false;
    });
    mockReadFileSync.mockImplementation((p: string) => {
      if (p.endsWith('package.json')) return '{"version":"0.0.0"}';
      if (p.endsWith('tsconfig.json'))
        return '{"files":[],"references":[{"path":"./tsconfig.app.json"},{"path":"./tsconfig.server.json"}]}';
      return '';
    });

    await init();

    const writeCall = mockWriteFileSync.mock.calls.find((c: unknown[]) =>
      String(c[0]).endsWith('tsconfig.json'),
    );
    expect(writeCall).toBeUndefined();
  });

  it('skips if no references array', async () => {
    mockExistsSync.mockImplementation((p: string) => {
      if (p.endsWith('package.json')) return true;
      if (p.endsWith('server.ts')) return false;
      if (p.endsWith('tsconfig.server.json')) return false;
      if (p.endsWith('tsconfig.json')) return true;
      return false;
    });
    mockReadFileSync.mockImplementation((p: string) => {
      if (p.endsWith('package.json')) return '{"version":"0.0.0"}';
      if (p.endsWith('tsconfig.json')) return '{"compilerOptions":{"strict":true}}';
      return '';
    });

    await init();

    const writeCall = mockWriteFileSync.mock.calls.find((c: unknown[]) =>
      String(c[0]).endsWith('tsconfig.json'),
    );
    expect(writeCall).toBeUndefined();
  });

  it('skips if no tsconfig.json', async () => {
    mockExistsSync.mockImplementation((p: string) => {
      if (p.endsWith('package.json')) return true;
      if (p.endsWith('server.ts')) return false;
      if (p.endsWith('tsconfig.server.json')) return false;
      if (p.endsWith('tsconfig.json')) return false;
      return false;
    });

    await init();

    const writeCall = mockWriteFileSync.mock.calls.find((c: unknown[]) =>
      String(c[0]).endsWith('tsconfig.json'),
    );
    expect(writeCall).toBeUndefined();
  });
});

describe('excludeServerFromApp', () => {
  const projectDir = '/fake/project';

  beforeEach(() => {
    vi.stubEnv('PATH', '/usr/bin');
    process.cwd = (): string => projectDir;
    mockExecSync.mockReturnValue(Buffer.from(''));
    mockReadFileSync.mockImplementation((p: string) => {
      if (p.endsWith('package.json')) return '{"version":"0.0.0","scripts":{}}';
      if (p.endsWith('tsconfig.app.json'))
        return '{"compilerOptions":{"types":[]},"exclude":["src/**/*.spec.ts"]}';
      return '';
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

  it('appends server.ts to existing exclude array', async () => {
    mockExistsSync.mockImplementation((p: string) => {
      if (p.endsWith('package.json')) return true;
      if (p.endsWith('server.ts')) return false;
      if (p.endsWith('tsconfig.server.json')) return false;
      if (p.endsWith('tsconfig.app.json')) return true;
      return false;
    });

    await init();

    expect(mockWriteFileSync).toHaveBeenCalledWith(
      path.join(projectDir, 'tsconfig.app.json'),
      expect.stringContaining('server.ts'),
      'utf8',
    );
  });

  it('skips if server.ts already excluded', async () => {
    mockExistsSync.mockImplementation((p: string) => {
      if (p.endsWith('package.json')) return true;
      if (p.endsWith('server.ts')) return false;
      if (p.endsWith('tsconfig.server.json')) return false;
      if (p.endsWith('tsconfig.app.json')) return true;
      return false;
    });
    mockReadFileSync.mockImplementation((p: string) => {
      if (p.endsWith('package.json')) return '{"version":"0.0.0"}';
      if (p.endsWith('tsconfig.app.json'))
        return '{"compilerOptions":{"types":[]},"exclude":["src/**/*.spec.ts","server.ts"]}';
      return '';
    });

    await init();

    const writeCall = mockWriteFileSync.mock.calls.find((c: unknown[]) =>
      String(c[0]).endsWith('tsconfig.app.json'),
    );
    expect(writeCall).toBeUndefined();
  });

  it('creates exclude array if none exists', async () => {
    mockExistsSync.mockImplementation((p: string) => {
      if (p.endsWith('package.json')) return true;
      if (p.endsWith('server.ts')) return false;
      if (p.endsWith('tsconfig.server.json')) return false;
      if (p.endsWith('tsconfig.app.json')) return true;
      return false;
    });
    mockReadFileSync.mockImplementation((p: string) => {
      if (p.endsWith('package.json')) return '{"version":"0.0.0"}';
      if (p.endsWith('tsconfig.app.json')) return '{"compilerOptions":{"types":[]}}';
      return '';
    });

    await init();

    const written = mockWriteFileSync.mock.calls.find((c: unknown[]) =>
      String(c[0]).endsWith('tsconfig.app.json'),
    );
    expect(written).toBeDefined();
    const parsed = JSON.parse(written![1] as string) as Record<string, unknown>;
    expect(parsed.exclude).toEqual(['server.ts']);
  });

  it('skips if no tsconfig.app.json', async () => {
    mockExistsSync.mockImplementation((p: string) => {
      if (p.endsWith('package.json')) return true;
      if (p.endsWith('server.ts')) return false;
      if (p.endsWith('tsconfig.server.json')) return false;
      if (p.endsWith('tsconfig.app.json')) return false;
      return false;
    });

    await init();

    const writeCall = mockWriteFileSync.mock.calls.find((c: unknown[]) =>
      String(c[0]).endsWith('tsconfig.app.json'),
    );
    expect(writeCall).toBeUndefined();
  });
});
