import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addScriptsToPackageJson,
  addTypeModuleToPackageJson,
  detectPackageManager,
  getInstallCmd,
  init,
  runQuietly,
  SERVER_TS,
  TSCONFIG_SERVER,
} from './init';

const mockExecSync: ReturnType<typeof vi.fn> = vi.hoisted(() => vi.fn());
const mockExistsSync: ReturnType<typeof vi.fn> = vi.hoisted(() => vi.fn());
const mockWriteFileSync: ReturnType<typeof vi.fn> = vi.hoisted(() => vi.fn());
const mockReadFileSync: ReturnType<typeof vi.fn> = vi.hoisted(() => vi.fn());
const mockAppendFileSync: ReturnType<typeof vi.fn> = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', () => ({
  execSync: mockExecSync,
}));

vi.mock('node:fs', () => ({
  default: {
    appendFileSync: mockAppendFileSync,
    existsSync: mockExistsSync,
    readFileSync: mockReadFileSync,
    writeFileSync: mockWriteFileSync,
  },
}));

const originalCwd: () => string = process.cwd;

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

describe('init', () => {
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
  });

  afterEach(() => {
    process.cwd = originalCwd;
    vi.clearAllMocks();
  });

  it('exits if no package.json found', async () => {
    mockExistsSync.mockReturnValue(false);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    await init();

    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });

  it('installs halide with detected package manager', async () => {
    mockExistsSync.mockImplementation((p: string) => {
      if (p.endsWith('package.json')) return true;
      if (p.endsWith('server.ts')) return false;
      return false;
    });

    await init();

    expect(mockExecSync).toHaveBeenCalledWith(
      'npm install halide && npm install -D @types/node',
      expect.objectContaining({ cwd: projectDir, stdio: 'pipe' }),
    );
  });

  it('creates server.ts if it does not exist', async () => {
    mockExistsSync.mockImplementation((p: string) => {
      if (p.endsWith('package.json')) return true;
      if (p.endsWith('server.ts')) return false;
      return false;
    });

    await init();

    expect(mockWriteFileSync).toHaveBeenCalledWith(
      path.join(projectDir, 'server.ts'),
      SERVER_TS,
      'utf8',
    );
  });

  it('does not overwrite existing server.ts', async () => {
    mockExistsSync.mockImplementation((p: string) => {
      if (p.endsWith('package.json')) return true;
      if (p.endsWith('server.ts')) return true;
      return false;
    });

    await init();

    const serverWriteCall = mockWriteFileSync.mock.calls.find((c: unknown[]) =>
      String(c[0]).endsWith('server.ts'),
    );
    expect(serverWriteCall).toBeUndefined();
  });

  it('runs skills add interactively with stdio inherit', async () => {
    mockExistsSync.mockImplementation((p: string) => {
      if (p.endsWith('package.json')) return true;
      if (p.endsWith('server.ts')) return false;
      return false;
    });

    await init();

    expect(mockExecSync).toHaveBeenCalledWith('npx skills add kevinchatham/halide', {
      cwd: projectDir,
      stdio: 'inherit',
    });
  });

  it('detects pnpm and uses pnpm add', async () => {
    mockExistsSync.mockImplementation((p: string) => {
      if (p.endsWith('package.json')) return true;
      if (p.endsWith('pnpm-lock.yaml')) return true;
      if (p.endsWith('server.ts')) return false;
      return false;
    });

    await init();

    expect(mockExecSync).toHaveBeenCalledWith(
      'pnpm add halide && pnpm add -D @types/node',
      expect.objectContaining({ cwd: projectDir, stdio: 'pipe' }),
    );
  });
});

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

describe('addTypeModuleToPackageJson', () => {
  const projectDir = '/fake/project';

  beforeEach(() => {
    vi.stubEnv('PATH', '/usr/bin');
    process.cwd = (): string => projectDir;
  });

  afterEach(() => {
    process.cwd = originalCwd;
    vi.clearAllMocks();
  });

  it('adds "type": "module" when it does not exist', () => {
    mockReadFileSync.mockImplementation((p: string) => {
      if (p.endsWith('package.json')) return '{"version":"0.0.0","name":"my-app"}';
      return '';
    });

    addTypeModuleToPackageJson(projectDir);

    const written = mockWriteFileSync.mock.calls.find((c: unknown[]) =>
      String(c[0]).endsWith('package.json'),
    );
    expect(written).toBeDefined();
    const parsed = JSON.parse(written![1] as string) as Record<string, unknown>;
    expect(parsed.type).toBe('module');
  });

  it('skips when "type": "module" already exists', () => {
    mockReadFileSync.mockImplementation((p: string) => {
      if (p.endsWith('package.json')) return '{"version":"0.0.0","type":"module"}';
      return '';
    });

    addTypeModuleToPackageJson(projectDir);

    const writeCall = mockWriteFileSync.mock.calls.find((c: unknown[]) =>
      String(c[0]).endsWith('package.json'),
    );
    expect(writeCall).toBeUndefined();
  });

  it('overwrites when "type" is set to "commonjs"', () => {
    mockReadFileSync.mockImplementation((p: string) => {
      if (p.endsWith('package.json')) return '{"version":"0.0.0","type":"commonjs"}';
      return '';
    });

    addTypeModuleToPackageJson(projectDir);

    const written = mockWriteFileSync.mock.calls.find((c: unknown[]) =>
      String(c[0]).endsWith('package.json'),
    );
    expect(written).toBeDefined();
    const parsed = JSON.parse(written![1] as string) as Record<string, unknown>;
    expect(parsed.type).toBe('module');
  });
});

describe('addTypeModuleToPackageJson', () => {
  const projectDir = '/fake/project';

  beforeEach(() => {
    vi.stubEnv('PATH', '/usr/bin');
    process.cwd = (): string => projectDir;
  });

  afterEach(() => {
    process.cwd = originalCwd;
    vi.clearAllMocks();
  });

  it('adds "type": "module" when it does not exist', () => {
    mockReadFileSync.mockImplementation((p: string) => {
      if (p.endsWith('package.json')) return '{"version":"0.0.0","name":"my-app"}';
      return '';
    });

    addTypeModuleToPackageJson(projectDir);

    const written = mockWriteFileSync.mock.calls.find((c: unknown[]) =>
      String(c[0]).endsWith('package.json'),
    );
    expect(written).toBeDefined();
    const parsed = JSON.parse(written![1] as string) as Record<string, unknown>;
    expect(parsed.type).toBe('module');
  });

  it('skips when "type": "module" already exists', () => {
    mockReadFileSync.mockImplementation((p: string) => {
      if (p.endsWith('package.json')) return '{"version":"0.0.0","type":"module"}';
      return '';
    });

    addTypeModuleToPackageJson(projectDir);

    const writeCall = mockWriteFileSync.mock.calls.find((c: unknown[]) =>
      String(c[0]).endsWith('package.json'),
    );
    expect(writeCall).toBeUndefined();
  });

  it('overwrites when "type" is set to "commonjs"', () => {
    mockReadFileSync.mockImplementation((p: string) => {
      if (p.endsWith('package.json')) return '{"version":"0.0.0","type":"commonjs"}';
      return '';
    });

    addTypeModuleToPackageJson(projectDir);

    const written = mockWriteFileSync.mock.calls.find((c: unknown[]) =>
      String(c[0]).endsWith('package.json'),
    );
    expect(written).toBeDefined();
    const parsed = JSON.parse(written![1] as string) as Record<string, unknown>;
    expect(parsed.type).toBe('module');
  });
});
