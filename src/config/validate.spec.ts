import { validateServerConfig } from './validate';

describe('validateServerConfig', () => {
  it('accepts minimal valid config', async () => {
    const result = await validateServerConfig({
      app: {},
    });
    expect(result.valid).toBe(true);
  });

  it('rejects config with errors', async () => {
    const result = await validateServerConfig({
      security: {
        auth: { strategy: 'bearer' },
      },
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors.at(0)?.field).toBe('security.auth');
  });

  it('accepts config with function secret (sync validation deferred to request time)', async () => {
    const result = await validateServerConfig({
      security: {
        auth: { secret: () => '', strategy: 'bearer' },
      },
    });
    expect(result.valid).toBe(true);
  });

  it('rejects config with empty string secret', async () => {
    const result = await validateServerConfig({
      security: {
        auth: { secret: '' as never, strategy: 'bearer' },
      },
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors.at(0)?.field).toBe('security.auth.secret');
  });

  it('accepts full valid config', async () => {
    const result = await validateServerConfig({
      app: { fallback: 'index.html', name: 'test' },
      security: {
        auth: { secret: () => 'secret123', strategy: 'bearer' },
        cors: { credentials: true, origin: ['http://localhost:3000'] },
        csp: { defaultSrc: ["'self'"] },
      },
    });
    expect(result.valid).toBe(true);
  });

  it('accepts empty config (no spa required anymore)', async () => {
    const result = await validateServerConfig({});
    expect(result.valid).toBe(true);
  });

  it('accepts observability with default maxCollect', async () => {
    const result = await validateServerConfig({
      observability: { maxCollect: 1024 },
    });
    expect(result.valid).toBe(true);
  });

  it('accepts observability with maxCollect at exact MAX_COLLECT_BYTES boundary', async () => {
    const result = await validateServerConfig({
      observability: { maxCollect: 1048576 },
    });
    expect(result.valid).toBe(true);
  });

  it('rejects observability with maxCollect exceeding 1024 KB', async () => {
    const result = await validateServerConfig({
      observability: { maxCollect: 1048577 },
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors.at(0)?.field).toBe('observability.maxCollect');
  });

  it('rejects observability with non-integer maxCollect', async () => {
    const result = await validateServerConfig({
      observability: { maxCollect: 1024.5 } as never,
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors.at(0)?.field).toBe('observability.maxCollect');
  });

  it('rejects observability with negative maxCollect', async () => {
    const result = await validateServerConfig({
      observability: { maxCollect: -100 },
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors.at(0)?.field).toBe('observability.maxCollect');
  });
});
