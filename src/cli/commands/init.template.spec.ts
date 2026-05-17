import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addScriptsToPackageJson,
  excludeServerFromApp,
  generateServerTs,
  init,
  resolveAppTsconfig,
  TSCONFIG_SERVER,
} from './init';

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

describe('generateServerTs', () => {
  it('generates server.ts with given app name and port', () => {
    const result = generateServerTs('my-custom-app', 8080);
    expect(result).toContain("name: 'my-custom-app'");
    expect(result).toContain('port: 8080');
    expect(result).toContain("import { defineHalide } from 'halide'");
  });

  it('generates server.ts with default app name', () => {
    const result = generateServerTs('my-app', 3553);
    expect(result).toContain("name: 'my-app'");
    expect(result).toContain('port: 3553');
  });
});

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

  it('logs dry-run messages and skips prompts', async () => {
    mockExistsSync.mockImplementation((p: string) => {
      if (p.endsWith('package.json')) return true;
      if (p.endsWith('server.ts')) return false;
      if (p.endsWith('tsconfig.server.json')) return false;
      return false;
    });

    const logSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true as boolean);

    await init({ dryRun: true });

    const output = logSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
    expect(output).toContain('[dry-run]');
    expect(logSpy).toHaveBeenCalled();
    logSpy.mockRestore();
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

  it('overwrites when force is true', async () => {
    mockExistsSync.mockImplementation((p: string) => {
      if (p.endsWith('package.json')) return true;
      if (p.endsWith('server.ts')) return false;
      if (p.endsWith('tsconfig.server.json')) return true;
      return false;
    });

    await init({ force: true });

    expect(mockWriteFileSync).toHaveBeenCalledWith(
      path.join(projectDir, 'tsconfig.server.json'),
      TSCONFIG_SERVER,
      'utf8',
    );
  });

  it('does not write when dryRun is true', async () => {
    mockExistsSync.mockImplementation((p: string) => {
      if (p.endsWith('package.json')) return true;
      if (p.endsWith('server.ts')) return false;
      if (p.endsWith('tsconfig.server.json')) return false;
      return false;
    });

    await init({ dryRun: true });

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
      if (p.endsWith('tsconfig.app.json')) return true;
      return false;
    });
    mockReadFileSync.mockImplementation((p: string) => {
      if (p.endsWith('package.json')) return '{"version":"0.0.0"}';
      if (p.endsWith('tsconfig.json')) return '{"compilerOptions":{"strict":true}}';
      if (p.endsWith('tsconfig.app.json'))
        return '{"compilerOptions":{"types":[]},"exclude":["src/**/*.spec.ts"]}';
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

  it('normalizes path comparison for references without ./ prefix', async () => {
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
        return '{"files":[],"references":[{"path":"./tsconfig.app.json"},{"path":"tsconfig.server.json"}]}';
      return '';
    });

    await init();

    const writeCall = mockWriteFileSync.mock.calls.find((c: unknown[]) =>
      String(c[0]).endsWith('tsconfig.json'),
    );
    expect(writeCall).toBeUndefined();
  });

  it('does not write when dryRun is true', async () => {
    mockExistsSync.mockImplementation((p: string) => {
      if (p.endsWith('package.json')) return true;
      if (p.endsWith('server.ts')) return false;
      if (p.endsWith('tsconfig.server.json')) return false;
      if (p.endsWith('tsconfig.json')) return true;
      return false;
    });

    await init({ dryRun: true });

    const writeCall = mockWriteFileSync.mock.calls.find((c: unknown[]) =>
      String(c[0]).endsWith('tsconfig.json'),
    );
    expect(writeCall).toBeUndefined();
  });

  it('re-adds reference when force is true and reference was removed', async () => {
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
        return '{"files":[],"references":[{"path":"./tsconfig.app.json"}]}';
      return '';
    });

    await init({ force: true });

    expect(mockWriteFileSync).toHaveBeenCalledWith(
      path.join(projectDir, 'tsconfig.json'),
      expect.stringContaining('./tsconfig.server.json'),
      'utf8',
    );
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

  it('preserves string exclude value by converting to array', async () => {
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
        return '{"compilerOptions":{"types":[]},"exclude":"old_value"}';
      return '';
    });

    await init();

    const written = mockWriteFileSync.mock.calls.find((c: unknown[]) =>
      String(c[0]).endsWith('tsconfig.app.json'),
    );
    expect(written).toBeDefined();
    const parsed = JSON.parse(written![1] as string) as Record<string, unknown>;
    expect(parsed.exclude).toEqual(['old_value', 'server.ts']);
  });

  it('overwrites when force is true and server.ts already excluded', async () => {
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

    await init({ force: true });

    const written = mockWriteFileSync.mock.calls.find((c: unknown[]) =>
      String(c[0]).endsWith('tsconfig.app.json'),
    );
    expect(written).toBeDefined();
  });

  it('does not write when dryRun is true', async () => {
    mockExistsSync.mockImplementation((p: string) => {
      if (p.endsWith('package.json')) return true;
      if (p.endsWith('server.ts')) return false;
      if (p.endsWith('tsconfig.server.json')) return false;
      if (p.endsWith('tsconfig.app.json')) return true;
      return false;
    });

    await init({ dryRun: true });

    const writeCall = mockWriteFileSync.mock.calls.find((c: unknown[]) =>
      String(c[0]).endsWith('tsconfig.app.json'),
    );
    expect(writeCall).toBeUndefined();
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

  it('uses cached content when provided', async () => {
    mockExistsSync.mockImplementation((p: string) => {
      if (p.endsWith('package.json')) return true;
      if (p.endsWith('server.ts')) return false;
      if (p.endsWith('tsconfig.server.json')) return false;
      if (p.endsWith('tsconfig.app.json')) return true;
      return false;
    });

    excludeServerFromApp(projectDir, false, false, '{"compilerOptions":{},"exclude":["src"]}');

    const written = mockWriteFileSync.mock.calls.find((c: unknown[]) =>
      String(c[0]).endsWith('tsconfig.app.json'),
    );
    expect(written).toBeDefined();
  });
});

describe('resolveAppTsconfig', () => {
  const projectDir = '/fake/project';

  beforeEach(() => {
    process.cwd = (): string => projectDir;
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.cwd = originalCwd;
    vi.clearAllMocks();
  });

  it('returns tsconfig.app.json when it exists', () => {
    mockExistsSync.mockImplementation((p: string) => p.endsWith('tsconfig.app.json'));
    mockReadFileSync.mockImplementation((p: string) =>
      p.endsWith('tsconfig.app.json') ? '{"compilerOptions":{}}' : '',
    );
    const result = resolveAppTsconfig(projectDir);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('tsconfig.app.json');
  });

  it('returns tsconfig.json when it exists without references', () => {
    mockExistsSync.mockImplementation((p: string) => p.endsWith('tsconfig.json'));
    mockReadFileSync.mockImplementation((_p: string) => '{"compilerOptions":{"strict":true}}');
    const result = resolveAppTsconfig(projectDir);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('tsconfig.json');
    expect(result!.content).toBe('{"compilerOptions":{"strict":true}}');
  });

  it('skips tsconfig.json when it has references', () => {
    mockExistsSync.mockImplementation((p: string) => p.endsWith('tsconfig.json'));
    mockReadFileSync.mockImplementation(
      (_p: string) => '{"references":[{"path":"./tsconfig.app.json"}]}',
    );
    expect(resolveAppTsconfig(projectDir)).toBeNull();
  });

  it('returns tsconfig.web.json when tsconfig.app.json does not exist', () => {
    mockExistsSync.mockImplementation((p: string) => p.endsWith('tsconfig.web.json'));
    mockReadFileSync.mockImplementation((p: string) =>
      p.endsWith('tsconfig.web.json') ? '{"compilerOptions":{}}' : '',
    );
    const result = resolveAppTsconfig(projectDir);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('tsconfig.web.json');
  });

  it('returns null when no tsconfig files exist', () => {
    mockExistsSync.mockReturnValue(false);
    expect(resolveAppTsconfig(projectDir)).toBeNull();
  });

  it('prefers tsconfig.app.json over tsconfig.json', () => {
    mockExistsSync.mockImplementation(
      (p: string) => p.endsWith('tsconfig.app.json') || p.endsWith('tsconfig.json'),
    );
    mockReadFileSync.mockImplementation((p: string) =>
      p.endsWith('tsconfig.app.json') ? '{"compilerOptions":{}}' : '',
    );
    const result = resolveAppTsconfig(projectDir);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('tsconfig.app.json');
  });
});

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
      expect.stringContaining('halide:start'),
      'utf8',
    );
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      path.join(projectDir, 'package.json'),
      expect.stringContaining('halide:build'),
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

  it('does not write when dryRun is true', () => {
    mockReadFileSync.mockImplementation((p: string) => {
      if (p.endsWith('package.json')) return '{"version":"0.0.0","scripts":{}}';
      return '';
    });
    mockExistsSync.mockReturnValue(true);

    addScriptsToPackageJson(projectDir, true);

    const writeCall = mockWriteFileSync.mock.calls.find((c: unknown[]) =>
      String(c[0]).endsWith('package.json'),
    );
    expect(writeCall).toBeUndefined();
  });

  it('overwrites scripts when force is true', () => {
    mockReadFileSync.mockImplementation((p: string) => {
      if (p.endsWith('package.json'))
        return '{"version":"0.0.0","scripts":{"halide:start":"old command","halide:build":"old build"}}';
      return '';
    });
    mockExistsSync.mockReturnValue(true);

    addScriptsToPackageJson(projectDir, false, true);

    const written = mockWriteFileSync.mock.calls.find((c: unknown[]) =>
      String(c[0]).endsWith('package.json'),
    );
    expect(written).toBeDefined();
    const parsed = JSON.parse(written![1] as string) as Record<string, unknown>;
    const scripts = parsed.scripts as Record<string, string>;
    expect(scripts['halide:start']).toBe('npm run halide:build && node dist/server.js');
    expect(scripts['halide:build']).toBe('tsc --project tsconfig.server.json');
  });
});
