import { validateServerConfig } from './validate';

describe('validateServerConfig — auth', () => {
  it('rejects bearer strategy without secret', async () => {
    const result = await validateServerConfig({
      app: { root: '/var/www' },
      security: {
        auth: { strategy: 'bearer' },
      },
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'auth.secret',
          message: expect.stringContaining('required'),
        }),
      ]),
    );
  });

  it('accepts bearer strategy with secret', async () => {
    const result = await validateServerConfig({
      app: { root: '/var/www' },
      security: {
        auth: { secret: () => 'secret', strategy: 'bearer' },
      },
    });
    expect(result.valid).toBe(true);
  });

  it('rejects jwks strategy without jwksUri', async () => {
    const result = await validateServerConfig({
      app: { root: '/var/www' },
      security: {
        auth: { strategy: 'jwks' },
      },
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'auth.jwksUri' })]),
    );
  });

  it('accepts jwks strategy with jwksUri', async () => {
    const result = await validateServerConfig({
      app: { root: '/var/www' },
      security: {
        auth: {
          jwksUri: 'https://auth.example.com/.well-known/jwks.json',
          strategy: 'jwks',
        },
      },
    });
    expect(result.valid).toBe(true);
  });

  it('rejects private routes without auth config', async () => {
    const result = await validateServerConfig({
      apiRoutes: [
        {
          access: 'private',
          handler: async () => ({}),
          path: '/private',
          type: 'api',
        },
      ],
      app: { root: '/var/www' },
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'security.auth' })]),
    );
  });

  it('accepts private routes with auth config', async () => {
    const result = await validateServerConfig({
      apiRoutes: [
        {
          access: 'private',
          handler: async () => ({}),
          path: '/private',
          type: 'api',
        },
      ],
      app: { root: '/var/www' },
      security: {
        auth: { secret: () => 'secret', strategy: 'bearer' },
      },
    });
    expect(result.valid).toBe(true);
  });

  it('accepts public routes without auth', async () => {
    const result = await validateServerConfig({
      apiRoutes: [
        {
          access: 'public',
          handler: async () => ({}),
          path: '/public',
          type: 'api',
        },
      ],
      app: { root: '/var/www' },
    });
    expect(result.valid).toBe(true);
  });

  it('rejects private proxy route without auth config', async () => {
    const result = await validateServerConfig({
      app: { root: '/var/www' },
      proxyRoutes: [
        {
          access: 'private',
          methods: ['get'],
          path: '/private',
          target: 'https://api.example.com',
          type: 'proxy',
        },
      ],
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'security.auth' })]),
    );
  });

  it('accepts private proxy route with auth config', async () => {
    const result = await validateServerConfig({
      app: { root: '/var/www' },
      proxyRoutes: [
        {
          access: 'private',
          methods: ['get'],
          path: '/private',
          target: 'https://api.example.com',
          type: 'proxy',
        },
      ],
      security: {
        auth: { secret: () => 'secret', strategy: 'bearer' },
      },
    });
    expect(result.valid).toBe(true);
  });

  it('rejects negative secretTtl', async () => {
    const result = await validateServerConfig({
      app: { root: '/var/www' },
      security: {
        auth: { secret: () => 'secret', secretTtl: -1, strategy: 'bearer' },
      },
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'auth.secretTtl' })]),
    );
  });

  it('rejects non-integer secretTtl', async () => {
    const result = await validateServerConfig({
      app: { root: '/var/www' },
      security: {
        auth: { secret: () => 'secret', secretTtl: 1.5, strategy: 'bearer' },
      },
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'auth.secretTtl' })]),
    );
  });

  it('accepts secretTtl of 0', async () => {
    const result = await validateServerConfig({
      app: { root: '/var/www' },
      security: {
        auth: { secret: () => 'secret', secretTtl: 0, strategy: 'bearer' },
      },
    });
    expect(result.valid).toBe(true);
  });

  it('accepts secretTtl of 60', async () => {
    const result = await validateServerConfig({
      app: { root: '/var/www' },
      security: {
        auth: { secret: () => 'secret', secretTtl: 60, strategy: 'bearer' },
      },
    });
    expect(result.valid).toBe(true);
  });

  it('rejects async secret that resolves to empty string', async () => {
    const result = await validateServerConfig({
      app: { root: '/var/www' },
      security: {
        auth: { secret: async () => '', strategy: 'bearer' },
      },
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'auth.secret',
          message: expect.stringContaining('empty'),
        }),
      ]),
    );
  });

  it('accepts async secret that resolves to non-empty string', async () => {
    const result = await validateServerConfig({
      app: { root: '/var/www' },
      security: {
        auth: { secret: async () => 'async-secret', strategy: 'bearer' },
      },
    });
    expect(result.valid).toBe(true);
  });

  it('handles async secret rejection gracefully', async () => {
    const result = await validateServerConfig({
      app: { root: '/var/www' },
      security: {
        auth: {
          secret: async () => {
            throw new Error('vault unreachable');
          },
          strategy: 'bearer',
        },
      },
    });
    // Rejection is caught and deferred — sync validation still passes
    expect(result.valid).toBe(true);
  });
});
