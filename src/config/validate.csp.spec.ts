import { validateServerConfig } from './validate';

describe('validateServerConfig — csp', () => {
  it('rejects unknown CSP directive keys', async () => {
    const result = await validateServerConfig({
      app: { root: '/var/www' },
      security: {
        csp: { defaltSrc: ["'self'"] },
      },
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'security.csp' })]),
    );
  });

  it('rejects kebab-case CSP directive keys', async () => {
    const result = await validateServerConfig({
      app: { root: '/var/www' },
      security: {
        csp: { 'default-src': ["'self'"] },
      },
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'security.csp' })]),
    );
  });
});
