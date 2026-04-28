import { validateServerConfig } from './validate';

describe('validateServerConfig — cors', () => {
  it('rejects wildcard origin with credentials true', () => {
    expect(() =>
      validateServerConfig({
        app: { root: '/var/www' },
        security: {
          auth: { secret: () => 'secret', strategy: 'bearer' },
          cors: { credentials: true, origin: '*' },
        },
      }),
    ).toThrow('Wildcard origin cannot be used with credentials: true');
  });

  it('rejects wildcard origin in array with credentials true', () => {
    expect(() =>
      validateServerConfig({
        app: { root: '/var/www' },
        security: {
          auth: { secret: () => 'secret', strategy: 'bearer' },
          cors: { credentials: true, origin: ['http://localhost:3000', '*'] },
        },
      }),
    ).toThrow('Wildcard origin cannot be used with credentials: true');
  });

  it('accepts wildcard origin without credentials', () => {
    expect(() =>
      validateServerConfig({
        app: { root: '/var/www' },
        security: {
          cors: { credentials: false, origin: '*' },
        },
      }),
    ).not.toThrow();
  });
});
