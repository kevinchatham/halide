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
    expect(() => logger.debug({} as unknown, 'test')).not.toThrow();
    expect(() => logger.error({} as unknown, 'test')).not.toThrow();
    expect(() => logger.info({} as unknown, 'test')).not.toThrow();
    expect(() => logger.warn({} as unknown, 'test')).not.toThrow();
  });

  it('outputs styled messages when stdout is a TTY', () => {
    const savedIsTTY = process.stdout.isTTY;
    // biome-ignore lint/suspicious/noConsole: test mocking for logger output
    const originalLog = console.log;
    const logMock = vi.fn(originalLog);

    process.stdout.isTTY = true;
    console.log = logMock as typeof console.log;

    const logger = createDefaultLogger();
    logger.debug({} as unknown, 'hello world');
    logger.error({} as unknown, 'hello world');
    logger.info({} as unknown, 'hello world');
    logger.warn({} as unknown, 'hello world');

    console.log = originalLog;
    process.stdout.isTTY = savedIsTTY;

    const calls = logMock.mock.calls;
    expect(calls.length).toBe(4);
    // biome-ignore lint/suspicious/noControlCharactersInRegex: matching ANSI escape codes
    expect(calls[0]?.[0] as string).toMatch(/\x1b\[/);
    expect(calls[0]?.[0] as string).toContain('[DEBUG]');
    // biome-ignore lint/suspicious/noControlCharactersInRegex: matching ANSI escape codes
    expect(calls[1]?.[0] as string).toMatch(/\x1b\[/);
    expect(calls[1]?.[0] as string).toContain('[ERROR]');
    // biome-ignore lint/suspicious/noControlCharactersInRegex: matching ANSI escape codes
    expect(calls[2]?.[0] as string).toMatch(/\x1b\[/);
    expect(calls[2]?.[0] as string).toContain('[INFO]');
    // biome-ignore lint/suspicious/noControlCharactersInRegex: matching ANSI escape codes
    expect(calls[3]?.[0] as string).toMatch(/\x1b\[/);
    expect(calls[3]?.[0] as string).toContain('[WARN]');
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
    expect(() => logger.debug({} as unknown, 'test')).not.toThrow();
    expect(() => logger.error({} as unknown, 'test')).not.toThrow();
    expect(() => logger.info({} as unknown, 'test')).not.toThrow();
    expect(() => logger.warn({} as unknown, 'test')).not.toThrow();
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
  it('wraps a logger with a fixed scope', () => {
    const baseLogger: Logger<{ requestId: string }> = {
      debug: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    };
    const scope = { requestId: 'abc-123' };
    const scoped = createScopedLogger(baseLogger, scope);

    scoped.info({ requestId: 'ignored' } as { requestId: string }, 'test message');
    expect(baseLogger.info).toHaveBeenCalledWith(scope, 'test message');

    scoped.error({ requestId: 'also-ignored' } as { requestId: string }, 'error msg');
    expect(baseLogger.error).toHaveBeenCalledWith(scope, 'error msg');

    scoped.debug({ requestId: 'x' } as { requestId: string }, 'debug msg');
    expect(baseLogger.debug).toHaveBeenCalledWith(scope, 'debug msg');

    scoped.warn({ requestId: 'y' } as { requestId: string }, 'warn msg');
    expect(baseLogger.warn).toHaveBeenCalledWith(scope, 'warn msg');
  });

  it('returns a logger with all four methods', () => {
    const baseLogger = createNoopLogger<{ requestId: string }>();
    const scoped = createScopedLogger(baseLogger, { requestId: 'test' });
    expect(typeof scoped.debug).toBe('function');
    expect(typeof scoped.error).toBe('function');
    expect(typeof scoped.info).toBe('function');
    expect(typeof scoped.warn).toBe('function');
  });
});
