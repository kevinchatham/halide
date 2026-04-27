import { validateServerConfig } from './validate';

describe('validateServerConfig — cors', () => {
  it('rejects wildcard origin with credentials true', () => {
    expect(() =>
      validateServerConfig({
        security: {
          auth: { secret: () => 'secret', strategy: 'bearer' },
          cors: { credentials: true, origin: '*' },
        },
        spa: { root: '/var/www' },
      }),
    ).toThrow('Wildcard origin cannot be used with credentials: true');
  });

  it('rejects wildcard origin in array with credentials true', () => {
    expect(() =>
      validateServerConfig({
        security: {
          auth: { secret: () => 'secret', strategy: 'bearer' },
          cors: { credentials: true, origin: ['http://localhost:3000', '*'] },
        },
        spa: { root: '/var/www' },
      }),
    ).toThrow('Wildcard origin cannot be used with credentials: true');
  });

  it('accepts wildcard origin without credentials', () => {
    expect(() =>
      validateServerConfig({
        security: {
          cors: { credentials: false, origin: '*' },
        },
        spa: { root: '/var/www' },
      }),
    ).not.toThrow();
  });
});
