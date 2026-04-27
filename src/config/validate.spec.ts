import { validateServerConfig } from './validate';

describe('validateServerConfig', () => {
  it('accepts minimal valid config', () => {
    expect(() =>
      validateServerConfig({
        spa: { root: '/var/www' },
      }),
    ).not.toThrow();
  });

  it('accepts full valid config', () => {
    expect(() =>
      validateServerConfig({
        security: {
          auth: { secret: () => 'secret123', strategy: 'bearer' },
          cors: { credentials: true, origin: ['http://localhost:3000'] },
          csp: { directives: { defaultSrc: ["'self'"] } },
        },
        spa: { fallback: 'index.html', name: 'test', root: '/public' },
      }),
    ).not.toThrow();
  });

  it('rejects missing spa.root', () => {
    expect(() =>
      validateServerConfig({
        spa: {},
      }),
    ).toThrow('spa.root is required');
  });

  it('rejects missing spa', () => {
    expect(() => validateServerConfig({})).toThrow('spa.root is required');
  });
});
