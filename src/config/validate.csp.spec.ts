import { validateServerConfig } from './validate';

describe('validateServerConfig — csp', () => {
  it('rejects kebab-case CSP directive keys', async () => {
    const result = await validateServerConfig({
      app: { root: '/var/www' },
      security: {
        // @ts-expect-error - intentionally passing kebab-case for runtime validation test
        csp: { directives: { 'default-src': ["'self'"] } },
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
