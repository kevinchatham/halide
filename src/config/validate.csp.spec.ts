import { validateServerConfig } from './validate';

describe('validateServerConfig — csp', () => {
  it('rejects kebab-case CSP directive keys', () => {
    expect(() =>
      validateServerConfig({
        security: {
          // @ts-expect-error - intentionally passing kebab-case for runtime validation test
          csp: { directives: { 'default-src': ["'self'"] } },
        },
        spa: { root: '/var/www' },
      }),
    ).toThrow("CSP directive 'default-src' uses kebab-case");
  });
});
