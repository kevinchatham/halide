import { validateServerConfig } from './validate';

describe('validateServerConfig — app', () => {
  it('accepts valid app.port', async () => {
    const result = await validateServerConfig({
      app: { port: 8080 },
    });
    expect(result.valid).toBe(true);
  });

  it('rejects app.port of 0', async () => {
    const result = await validateServerConfig({
      app: { port: 0 },
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: 'app.port must be an integer between 1 and 65535' }),
      ]),
    );
  });

  it('rejects negative app.port', async () => {
    const result = await validateServerConfig({
      app: { port: -1 },
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: 'app.port must be an integer between 1 and 65535' }),
      ]),
    );
  });

  it('rejects app.port above 65535', async () => {
    const result = await validateServerConfig({
      app: { port: 70000 },
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: 'app.port must be an integer between 1 and 65535' }),
      ]),
    );
  });

  it('rejects non-integer app.port', async () => {
    const result = await validateServerConfig({
      app: { port: 80.5 },
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: 'app.port must be an integer between 1 and 65535' }),
      ]),
    );
  });

  it('accepts app.port of 1', async () => {
    const result = await validateServerConfig({
      app: { port: 1 },
    });
    expect(result.valid).toBe(true);
  });

  it('accepts app.port of 65535', async () => {
    const result = await validateServerConfig({
      app: { port: 65535 },
    });
    expect(result.valid).toBe(true);
  });
});
