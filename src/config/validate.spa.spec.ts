import { validateServerConfig } from './validate';

describe('validateServerConfig — spa', () => {
  it('accepts valid spa.port', () => {
    expect(() =>
      validateServerConfig({
        spa: { port: 8080, root: '/var/www' },
      }),
    ).not.toThrow();
  });

  it('rejects spa.port of 0', () => {
    expect(() =>
      validateServerConfig({
        spa: { port: 0, root: '/var/www' },
      }),
    ).toThrow('spa.port must be an integer between 1 and 65535');
  });

  it('rejects negative spa.port', () => {
    expect(() =>
      validateServerConfig({
        spa: { port: -1, root: '/var/www' },
      }),
    ).toThrow('spa.port must be an integer between 1 and 65535');
  });

  it('rejects spa.port above 65535', () => {
    expect(() =>
      validateServerConfig({
        spa: { port: 70000, root: '/var/www' },
      }),
    ).toThrow('spa.port must be an integer between 1 and 65535');
  });

  it('rejects non-integer spa.port', () => {
    expect(() =>
      validateServerConfig({
        spa: { port: 80.5, root: '/var/www' },
      }),
    ).toThrow('spa.port must be an integer between 1 and 65535');
  });

  it('accepts spa.port of 1', () => {
    expect(() =>
      validateServerConfig({
        spa: { port: 1, root: '/var/www' },
      }),
    ).not.toThrow();
  });

  it('accepts spa.port of 65535', () => {
    expect(() =>
      validateServerConfig({
        spa: { port: 65535, root: '/var/www' },
      }),
    ).not.toThrow();
  });
});
