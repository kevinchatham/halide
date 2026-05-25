import { describe, expect, it, vi } from 'vitest';

import type { HalideContext, Logger, RequestContext } from '../types/app';
import {
  createDefaultLogger,
  createNoopLogger,
  createScopedLogger,
  DEFAULTS,
  defaultAuthorize,
} from './defaults';

describe('defaultAuthorize', () => {
  it('returns true', async () => {
    const result = await defaultAuthorize({} as RequestContext, {} as HalideContext);
    expect(result).toBe(true);
  });
});

describe('createDefaultLogger', () => {
  it('returns a logger with all methods', () => {
    const logger = createDefaultLogger();
    expect(typeof logger.debug).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
  });

  it('does not throw when methods are called', () => {
    const logger = createDefaultLogger();
    expect(() => logger.debug()).not.toThrow();
    expect(() => logger.error()).not.toThrow();
    expect(() => logger.info()).not.toThrow();
    expect(() => logger.warn()).not.toThrow();
  });

  it('outputs formatted plain text when formatMessage is true (default)', () => {
    // biome-ignore lint/suspicious/noConsole: test mocking for logger output
    const originalLog = console.log;
    const logMock = vi.fn(originalLog);
    console.log = logMock as typeof console.log;

    const logger = createDefaultLogger();
    logger.info({ action: 'login', userId: '123' });
    logger.error({ code: 500, message: 'something failed' });

    console.log = originalLog;

    const calls = logMock.mock.calls;
    expect(calls.length).toBe(2);
    expect(calls[0]?.[0]).toMatch(/^\[INFO\] action="login" userId="123"$/);
    expect(calls[1]?.[0]).toMatch(/^\[ERROR\] code=500 message="something failed"$/);
  });

  it('outputs compact JSON when formatMessage is false', () => {
    // biome-ignore lint/suspicious/noConsole: test mocking for logger output
    const originalLog = console.log;
    const logMock = vi.fn(originalLog);
    console.log = logMock as typeof console.log;

    const logger = createDefaultLogger({ formatMessage: false });
    logger.info({ action: 'login', userId: '123' });
    logger.error({ message: 'something failed' });

    console.log = originalLog;

    const calls = logMock.mock.calls;
    expect(calls.length).toBe(2);
    const parsed0 = JSON.parse(calls[0]?.[0] as string);
    expect(parsed0.level).toBe('INFO');
    expect(parsed0.scope).toEqual({ action: 'login', userId: '123' });
    const parsed1 = JSON.parse(calls[1]?.[0] as string);
    expect(parsed1.level).toBe('ERROR');
    expect(parsed1.scope).toEqual({ message: 'something failed' });
  });

  it('outputs formatted text when no overrides provided', () => {
    // biome-ignore lint/suspicious/noConsole: test mocking for logger output
    const originalLog = console.log;
    const logMock = vi.fn(originalLog);
    console.log = logMock as typeof console.log;

    const logger = createDefaultLogger();
    logger.info();

    console.log = originalLog;

    const calls = logMock.mock.calls;
    expect(calls.length).toBe(1);
    expect(calls[0]?.[0]).toBe('[INFO]');
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
    expect(() => logger.debug()).not.toThrow();
    expect(() => logger.error()).not.toThrow();
    expect(() => logger.info()).not.toThrow();
    expect(() => logger.warn()).not.toThrow();
  });
});

describe('DEFAULTS', () => {
  it('has expected default values', () => {
    expect(DEFAULTS.route.method).toBe('get');
    expect(DEFAULTS.proxy.timeoutMs).toBe(10_000);
    expect(DEFAULTS.rateLimit.maxRequests).toBe(100);
    expect(DEFAULTS.rateLimit.windowMs).toBe(900_000);
    expect(DEFAULTS.app.apiPrefix).toBe('/api');
    expect(DEFAULTS.app.fallback).toBe('index.html');
    expect(DEFAULTS.openapi.path).toBe('/swagger');
    expect(DEFAULTS.openapi.title).toBe('Halide API');
    expect(DEFAULTS.openapi.version).toBe('1.0.0');
    expect(DEFAULTS.cors.origin).toEqual([]);
  });
});

describe('createScopedLogger', () => {
  it('merges caller overrides with base scope', () => {
    const baseLogger: Logger<{ requestId: string; message?: string }> = {
      debug: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    };
    const scope: { message?: string; requestId: string } = { requestId: 'abc-123' };
    const scoped = createScopedLogger(baseLogger, scope);

    scoped.info({ message: 'test message' });
    expect(baseLogger.info).toHaveBeenCalledWith({ message: 'test message', requestId: 'abc-123' });

    scoped.error({ message: 'error msg' });
    expect(baseLogger.error).toHaveBeenCalledWith({ message: 'error msg', requestId: 'abc-123' });

    scoped.debug({ message: 'debug msg' });
    expect(baseLogger.debug).toHaveBeenCalledWith({ message: 'debug msg', requestId: 'abc-123' });

    scoped.warn({ message: 'warn msg' });
    expect(baseLogger.warn).toHaveBeenCalledWith({ message: 'warn msg', requestId: 'abc-123' });
  });

  it('passes base scope when no overrides provided', () => {
    const baseLogger: Logger<{ requestId: string; message?: string }> = {
      debug: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    };
    const scope: { message?: string; requestId: string } = { requestId: 'abc-123' };
    const scoped = createScopedLogger(baseLogger, scope);

    scoped.info();
    expect(baseLogger.info).toHaveBeenCalledWith({ requestId: 'abc-123' });
  });

  it('overrides base scope fields (last-write-wins)', () => {
    const baseLogger: Logger<{ requestId: string; message?: string }> = {
      debug: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    };
    const scope: { message?: string; requestId: string } = { requestId: 'abc-123' };
    const scoped = createScopedLogger(baseLogger, scope);

    scoped.info({ requestId: 'overridden' });
    expect(baseLogger.info).toHaveBeenCalledWith({ requestId: 'overridden' });
  });

  it('returns a logger with all four methods', () => {
    const baseLogger = createNoopLogger<{ requestId: string; message?: string }>();
    const scoped = createScopedLogger(baseLogger, { requestId: 'test' });
    expect(typeof scoped.debug).toBe('function');
    expect(typeof scoped.error).toBe('function');
    expect(typeof scoped.info).toBe('function');
    expect(typeof scoped.warn).toBe('function');
  });
});
