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
    expect(result.errors.at(0)?.field).toBe('auth.secret');
  });

  it('rejects config with empty secret', async () => {
    const result = await validateServerConfig({
      security: {
        auth: { secret: () => '', strategy: 'bearer' },
      },
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors.at(0)?.field).toBe('auth.secret');
  });

  it('rejects config with empty string secret', async () => {
    const result = await validateServerConfig({
      security: {
        auth: { secret: '' as never, strategy: 'bearer' },
      },
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors.at(0)?.field).toBe('auth.secret');
  });

  it('accepts full valid config', async () => {
    const result = await validateServerConfig({
      app: { fallback: 'index.html', name: 'test' },
      security: {
        auth: { secret: () => 'secret123', strategy: 'bearer' },
        cors: { credentials: true, origin: ['http://localhost:3000'] },
        csp: { directives: { defaultSrc: ["'self'"] } },
      },
    });
    expect(result.valid).toBe(true);
  });

  it('accepts empty config (no spa required anymore)', async () => {
    const result = await validateServerConfig({});
    expect(result.valid).toBe(true);
  });
});
