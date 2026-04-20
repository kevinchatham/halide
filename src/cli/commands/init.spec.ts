import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildAgentsMd,
  detectPackageManager,
  getInstallCmd,
  init,
  runQuietly,
  SERVER_TS,
  TSCONFIG_SERVER,
} from './init';

declare global {
  var HALIDE_VERSION: string | undefined;
}

globalThis.HALIDE_VERSION = undefined;

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
    expect(getInstallCmd('npm')).toBe('npm install halide');
  });

  it('returns correct pnpm command', () => {
    expect(getInstallCmd('pnpm')).toBe('pnpm add halide');
  });

  it('returns correct yarn command', () => {
    expect(getInstallCmd('yarn')).toBe('yarn add halide');
  });

  it('returns correct bun command', () => {
    expect(getInstallCmd('bun')).toBe('bun add halide');
  });
});

describe('buildAgentsMd', () => {
  it('wraps content with version markers', () => {
    const result = buildAgentsMd('1.2.3');
    expect(result).toContain('<!-- halide:1.2.3 -->');
    expect(result).toContain('<!-- /halide -->');
    expect(result).toContain('# Halide Agent Guide');
  });

  it('places start marker before content and end marker after', () => {
    const result = buildAgentsMd('0.0.0');
    const startIdx = result.indexOf('<!-- halide:0.0.0 -->');
    const contentIdx = result.indexOf('# Halide Agent Guide');
    const endIdx = result.indexOf('<!-- /halide -->');
    expect(startIdx).toBeLessThan(contentIdx);
    expect(contentIdx).toBeLessThan(endIdx);
  });
});

describe('init', () => {
  const projectDir = '/fake/project';

  beforeEach(() => {
    vi.stubEnv('PATH', '/usr/bin');
    process.cwd = (): string => projectDir;
    mockExecSync.mockReturnValue(Buffer.from(''));
    mockReadFileSync.mockReturnValue('{"version":"0.0.0"}');
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
      if (p.endsWith('AGENTS.md')) return false;
      return false;
    });

    await init();

    expect(mockExecSync).toHaveBeenCalledWith(
      'npm install halide',
      expect.objectContaining({ cwd: projectDir, stdio: 'pipe' }),
    );
  });

  it('runs skills add command', async () => {
    mockExistsSync.mockImplementation((p: string) => {
      if (p.endsWith('package.json')) return true;
      if (p.endsWith('server.ts')) return false;
      if (p.endsWith('AGENTS.md')) return false;
      return false;
    });

    await init();

    expect(mockExecSync).toHaveBeenCalledWith(
      'npx skills add kevinchatham/halide --all -y',
      expect.objectContaining({ cwd: projectDir, stdio: 'pipe' }),
    );
  });

  it('continues if skills add fails and prints stderr', async () => {
    mockExistsSync.mockImplementation((p: string) => {
      if (p.endsWith('package.json')) return true;
      if (p.endsWith('server.ts')) return false;
      if (p.endsWith('AGENTS.md')) return false;
      return false;
    });
    const stderrOutput = 'npx: command not found\n';
    const skillsError = new Error('skills not found') as Error & { stderr: Buffer };
    skillsError.stderr = Buffer.from(stderrOutput);
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd.includes('skills add')) throw skillsError;
      return Buffer.from('');
    });
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    await expect(init()).resolves.toBeUndefined();
    expect(stderrSpy).toHaveBeenCalledWith(stderrOutput);

    stderrSpy.mockRestore();
  });

  it('creates server.ts if it does not exist', async () => {
    mockExistsSync.mockImplementation((p: string) => {
      if (p.endsWith('package.json')) return true;
      if (p.endsWith('server.ts')) return false;
      if (p.endsWith('AGENTS.md')) return false;
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
      if (p.endsWith('AGENTS.md')) return false;
      return false;
    });

    await init();

    const serverWriteCall = mockWriteFileSync.mock.calls.find((c: unknown[]) =>
      String(c[0]).endsWith('server.ts'),
    );
    expect(serverWriteCall).toBeUndefined();
  });

  it('creates AGENTS.md if it does not exist', async () => {
    mockExistsSync.mockImplementation((p: string) => {
      if (p.endsWith('package.json')) return true;
      if (p.endsWith('server.ts')) return false;
      if (p.endsWith('AGENTS.md')) return false;
      return false;
    });

    await init();

    expect(mockWriteFileSync).toHaveBeenCalledWith(
      path.join(projectDir, 'AGENTS.md'),
      expect.stringContaining('<!-- halide:'),
      'utf8',
    );
  });

  it('appends Halide section when AGENTS.md exists without markers', async () => {
    mockExistsSync.mockImplementation((p: string) => {
      if (p.endsWith('package.json')) return true;
      if (p.endsWith('server.ts')) return false;
      if (p.endsWith('AGENTS.md')) return true;
      return false;
    });
    mockReadFileSync.mockImplementation((p: string) => {
      if (p.endsWith('package.json')) return '{"version":"0.0.0"}';
      return '# Existing content\n';
    });

    await init();

    expect(mockAppendFileSync).toHaveBeenCalledWith(
      path.join(projectDir, 'AGENTS.md'),
      expect.stringContaining('<!-- halide:'),
      'utf8',
    );
    const writeCall = mockWriteFileSync.mock.calls.find((c: unknown[]) =>
      String(c[0]).endsWith('AGENTS.md'),
    );
    expect(writeCall).toBeUndefined();
  });

  it('replaces delimited block when AGENTS.md has existing markers', async () => {
    const existingContent = `# My Project\n\n<!-- halide:0.0.1 -->\n# Old Halide Content\n<!-- /halide -->\n`;
    mockExistsSync.mockImplementation((p: string) => {
      if (p.endsWith('package.json')) return true;
      if (p.endsWith('server.ts')) return false;
      if (p.endsWith('AGENTS.md')) return true;
      return false;
    });
    mockReadFileSync.mockImplementation((p: string) => {
      if (p.endsWith('package.json')) return '{"version":"0.0.0"}';
      return existingContent;
    });

    await init();

    expect(mockWriteFileSync).toHaveBeenCalledWith(
      path.join(projectDir, 'AGENTS.md'),
      expect.not.stringContaining('<!-- halide:0.0.1 -->'),
      'utf8',
    );
    expect(mockAppendFileSync).not.toHaveBeenCalled();
  });

  it('detects pnpm and uses pnpm add', async () => {
    mockExistsSync.mockImplementation((p: string) => {
      if (p.endsWith('package.json')) return true;
      if (p.endsWith('pnpm-lock.yaml')) return true;
      if (p.endsWith('server.ts')) return false;
      if (p.endsWith('AGENTS.md')) return false;
      return false;
    });

    await init();

    expect(mockExecSync).toHaveBeenCalledWith(
      'pnpm add halide',
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
    mockReadFileSync.mockReturnValue('{"version":"0.0.0"}');
  });

  afterEach(() => {
    process.cwd = originalCwd;
    vi.clearAllMocks();
  });

  it('creates tsconfig.server.json when it does not exist', async () => {
    mockExistsSync.mockImplementation((p: string) => {
      if (p.endsWith('package.json')) return true;
      if (p.endsWith('server.ts')) return false;
      if (p.endsWith('AGENTS.md')) return false;
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
      if (p.endsWith('AGENTS.md')) return false;
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
      if (p.endsWith('package.json')) return '{"version":"0.0.0"}';
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
      if (p.endsWith('AGENTS.md')) return false;
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
      if (p.endsWith('AGENTS.md')) return false;
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
      if (p.endsWith('AGENTS.md')) return false;
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
      if (p.endsWith('AGENTS.md')) return false;
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
      if (p.endsWith('package.json')) return '{"version":"0.0.0"}';
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
      if (p.endsWith('AGENTS.md')) return false;
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
      if (p.endsWith('AGENTS.md')) return false;
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
      if (p.endsWith('AGENTS.md')) return false;
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
      if (p.endsWith('AGENTS.md')) return false;
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
