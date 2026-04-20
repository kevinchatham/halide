import { createNoopLogger, DEFAULTS, defaultAuthorize } from './defaults';

describe('defaultAuthorize', () => {
  it('returns true', async () => {
    const result = await defaultAuthorize();
    expect(result).toBe(true);
  });
});

describe('createNoopLogger', () => {
  it('returns a logger with all methods', () => {
    const logger = createNoopLogger();
    expect(typeof logger.debug).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
  });

  it('does not throw when methods are called', () => {
    const logger = createNoopLogger();
    expect(() => logger.debug('test')).not.toThrow();
    expect(() => logger.error('test')).not.toThrow();
    expect(() => logger.info('test')).not.toThrow();
    expect(() => logger.warn('test')).not.toThrow();
  });
});

describe('DEFAULTS', () => {
  it('has expected default values', () => {
    expect(DEFAULTS.route.method).toBe('get');
    expect(DEFAULTS.proxy.timeoutMs).toBe(60_000);
    expect(DEFAULTS.rateLimit.maxRequests).toBe(100);
    expect(DEFAULTS.rateLimit.windowMs).toBe(900_000);
    expect(DEFAULTS.spa.apiPrefix).toBe('/api');
    expect(DEFAULTS.spa.fallback).toBe('index.html');
    expect(DEFAULTS.openapi.path).toBe('/swagger');
    expect(DEFAULTS.openapi.title).toBe('Halide API');
    expect(DEFAULTS.openapi.version).toBe('1.0.0');
  });
});
