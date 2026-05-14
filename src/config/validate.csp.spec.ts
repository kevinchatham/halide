import { validateServerConfig } from './validate';

describe('validateServerConfig — csp', () => {
  it('rejects kebab-case CSP directive keys', async () => {
    const result = await validateServerConfig({
      app: { root: '/var/www' },
      security: {
        csp: { 'default-src': ["'self'"] },
      },
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: expect.stringContaining('kebab-case') }),
      ]),
    );
  });
});
