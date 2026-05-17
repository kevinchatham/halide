import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addToTsconfigExclude,
  generateFullProject,
  TSCONFIG_SERVER_FULL,
  writeTsconfigServer,
} from './init.template';

const mockExistsSync: ReturnType<typeof vi.fn> = vi.hoisted(() => vi.fn());
const mockWriteFileSync: ReturnType<typeof vi.fn> = vi.hoisted(() => vi.fn());
const mockReadFileSync: ReturnType<typeof vi.fn> = vi.hoisted(() => vi.fn());

vi.mock('node:fs', () => {
  const mocks = {
    existsSync: mockExistsSync,
    readFileSync: mockReadFileSync,
    writeFileSync: mockWriteFileSync,
  };
  return {
    ...mocks,
    default: mocks,
  };
});

describe('generateFullProject', () => {
  it('creates all expected files', () => {
    const result = generateFullProject('my-app', 3553);
    const expectedFiles = [
      'src/halide/builder.ts',
      'src/halide/types.ts',
      'src/routes/health.ts',
      'src/routes/index.ts',
      'src/server.ts',
    ];
    for (const file of expectedFiles) {
      expect(result).toHaveProperty(file);
    }
  });

  it('generates builder.ts with UserClaims and LogScope types', () => {
    const result = generateFullProject('my-app', 3553);
    expect(result['src/halide/builder.ts']).toContain(
      "import type { UserClaims, LogScope } from './types'",
    );
    expect(result['src/halide/builder.ts']).toContain('defineHalide<');
    expect(result['src/halide/builder.ts']).toContain('UserClaims,');
    expect(result['src/halide/builder.ts']).toContain('LogScope');
    expect(result['src/halide/builder.ts']).toContain(
      'apiRoute, proxyRoute, createServer, createApp',
    );
  });

  it('generates types.ts with UserClaims and LogScope interfaces', () => {
    const result = generateFullProject('my-app', 3553);
    expect(result['src/halide/types.ts']).toContain('export interface UserClaims');
    expect(result['src/halide/types.ts']).toContain('sub: string');
    expect(result['src/halide/types.ts']).toContain("role: 'admin' | 'user'");
    expect(result['src/halide/types.ts']).toContain('export interface LogScope');
    expect(result['src/halide/types.ts']).toContain('requestId: string');
    expect(result['src/halide/types.ts']).toContain('userId?: string');
  });

  it('generates health.ts with public route', () => {
    const result = generateFullProject('my-app', 3553);
    expect(result['src/routes/health.ts']).toContain(
      "import { apiRoute } from '../halide/builder'",
    );
    expect(result['src/routes/health.ts']).toContain('healthRoutes');
    expect(result['src/routes/health.ts']).toContain("access: 'public'");
    expect(result['src/routes/health.ts']).toContain("path: '/health'");
    expect(result['src/routes/health.ts']).toContain("({ status: 'ok' })");
  });

  it('generates routes/index.ts barrel export', () => {
    const result = generateFullProject('my-app', 3553);
    expect(result['src/routes/index.ts']).toContain("export { healthRoutes } from './health'");
  });

  it('generates server.ts with createServer and healthRoutes', () => {
    const result = generateFullProject('my-app', 3553);
    expect(result['src/server.ts']).toContain("import { createServer } from './halide/builder'");
    expect(result['src/server.ts']).toContain("import { healthRoutes } from './routes'");
    expect(result['src/server.ts']).toContain('apiRoutes: [...healthRoutes]');
    expect(result['src/server.ts']).toContain("name: 'my-app'");
    expect(result['src/server.ts']).toContain('port: 3553');
    expect(result['src/server.ts']).toContain("root: 'dist'");
    expect(result['src/server.ts']).toContain('server.start()');
  });

  it('uses provided app name and port', () => {
    const result = generateFullProject('custom-app', 8080);
    expect(result['src/server.ts']).toContain("name: 'custom-app'");
    expect(result['src/server.ts']).toContain('port: 8080');
  });
});

describe('TSCONFIG_SERVER_FULL', () => {
  it('includes src/server.ts', () => {
    expect(TSCONFIG_SERVER_FULL).toContain('"include": ["src/server.ts"]');
  });

  it('targets ES2022 with CommonJS', () => {
    expect(TSCONFIG_SERVER_FULL).toContain('"target": "es2022"');
    expect(TSCONFIG_SERVER_FULL).toContain('"module": "commonjs"');
  });

  it('includes strict mode and node types', () => {
    expect(TSCONFIG_SERVER_FULL).toContain('"strict": true');
    expect(TSCONFIG_SERVER_FULL).toContain('"types": ["node"]');
  });

  it('outputs to ./dist', () => {
    expect(TSCONFIG_SERVER_FULL).toContain('"outDir": "./dist"');
  });
});

describe('writeTsconfigServer with fullProject', () => {
  const projectDir = '/fake/project';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('writes full project tsconfig', () => {
    mockExistsSync.mockReturnValue(false);

    writeTsconfigServer(projectDir, false, false, true);

    expect(mockWriteFileSync).toHaveBeenCalledWith(
      path.join(projectDir, 'tsconfig.server.json'),
      TSCONFIG_SERVER_FULL,
      'utf8',
    );
  });
});

describe('addToTsconfigExclude with full project path', () => {
  const projectDir = '/fake/project';

  beforeEach(() => {
    mockReadFileSync.mockImplementation((p: string) => {
      if (p.endsWith('tsconfig.app.json'))
        return '{"compilerOptions":{"types":[]},"exclude":["src/**/*.spec.ts"]}';
      return '';
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('excludes src/server.ts for full projects', () => {
    mockExistsSync.mockImplementation((p: string) => p.endsWith('tsconfig.app.json'));

    addToTsconfigExclude(projectDir, false, false, 'src/server.ts');

    expect(mockWriteFileSync).toHaveBeenCalledWith(
      path.join(projectDir, 'tsconfig.app.json'),
      expect.stringContaining('src/server.ts'),
      'utf8',
    );
  });

  it('skips if src/server.ts already excluded', () => {
    mockExistsSync.mockImplementation((p: string) => p.endsWith('tsconfig.app.json'));
    mockReadFileSync.mockImplementation((p: string) => {
      if (p.endsWith('tsconfig.app.json'))
        return '{"compilerOptions":{"types":[]},"exclude":["src/**/*.spec.ts","src/server.ts"]}';
      return '';
    });

    addToTsconfigExclude(projectDir, false, false, 'src/server.ts');

    const writeCall = mockWriteFileSync.mock.calls.find((c: unknown[]) =>
      String(c[0]).endsWith('tsconfig.app.json'),
    );
    expect(writeCall).toBeUndefined();
  });
});
