import { validateServerConfig } from './validate';

describe('validateServerConfig — cors', () => {
  it('rejects wildcard origin with credentials true', async () => {
    const result = await validateServerConfig({
      app: { root: '/var/www' },
      security: {
        auth: { secret: () => 'secret', strategy: 'bearer' },
        cors: { credentials: true, origin: '*' },
      },
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: 'Wildcard origin cannot be used with credentials: true',
        }),
      ]),
    );
  });

  it('rejects wildcard origin in array with credentials true', async () => {
    const result = await validateServerConfig({
      app: { root: '/var/www' },
      security: {
        auth: { secret: () => 'secret', strategy: 'bearer' },
        cors: { credentials: true, origin: ['http://localhost:3000', '*'] },
      },
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: 'Wildcard origin cannot be used with credentials: true',
        }),
      ]),
    );
  });

  it('accepts wildcard origin without credentials', async () => {
    const result = await validateServerConfig({
      app: { root: '/var/www' },
      security: {
        cors: { credentials: false, origin: '*' },
      },
    });
    expect(result.valid).toBe(true);
  });
});
