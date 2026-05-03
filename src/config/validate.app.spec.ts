import { validateServerConfig } from './validate';

describe('validateServerConfig — app', () => {
  it('accepts valid app.port', () => {
    expect(() =>
      validateServerConfig({
        app: { port: 8080 },
      }),
    ).not.toThrow();
  });

  it('rejects app.port of 0', () => {
    expect(() =>
      validateServerConfig({
        app: { port: 0 },
      }),
    ).toThrow('app.port must be an integer between 1 and 65535');
  });

  it('rejects negative app.port', () => {
    expect(() =>
      validateServerConfig({
        app: { port: -1 },
      }),
    ).toThrow('app.port must be an integer between 1 and 65535');
  });

  it('rejects app.port above 65535', () => {
    expect(() =>
      validateServerConfig({
        app: { port: 70000 },
      }),
    ).toThrow('app.port must be an integer between 1 and 65535');
  });

  it('rejects non-integer app.port', () => {
    expect(() =>
      validateServerConfig({
        app: { port: 80.5 },
      }),
    ).toThrow('app.port must be an integer between 1 and 65535');
  });

  it('accepts app.port of 1', () => {
    expect(() =>
      validateServerConfig({
        app: { port: 1 },
      }),
    ).not.toThrow();
  });

  it('accepts app.port of 65535', () => {
    expect(() =>
      validateServerConfig({
        app: { port: 65535 },
      }),
    ).not.toThrow();
  });
});
