import { validateServerConfig } from './validate';

describe('validateServerConfig', () => {
  it('accepts minimal valid config', () => {
    expect(() =>
      validateServerConfig({
        app: {},
      }),
    ).not.toThrow();
  });

  it('accepts full valid config', () => {
    expect(() =>
      validateServerConfig({
        app: { fallback: 'index.html', name: 'test' },
        security: {
          auth: { secret: () => 'secret123', strategy: 'bearer' },
          cors: { credentials: true, origin: ['http://localhost:3000'] },
          csp: { directives: { defaultSrc: ["'self'"] } },
        },
      }),
    ).not.toThrow();
  });

  it('accepts empty config (no spa required anymore)', () => {
    expect(() => validateServerConfig({})).not.toThrow();
  });
});
