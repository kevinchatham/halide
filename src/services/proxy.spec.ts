import type { Request, Response } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { createNoopLogger, DEFAULTS } from '../config/defaults';
import type { Logger } from '../config/types';
import { createProxyService } from './proxy';

vi.mock('http-proxy-middleware', () => ({
  createProxyMiddleware: vi.fn(),
}));

const mockedCreateProxyMiddleware: ReturnType<typeof vi.mocked<typeof createProxyMiddleware>> =
  vi.mocked(createProxyMiddleware);
const noopLogger: Logger = createNoopLogger();

describe('createProxyService', () => {
  beforeEach(() => {
    mockedCreateProxyMiddleware.mockClear();
  });

  it('creates proxy middleware with correct configuration', () => {
    createProxyService(
      'https://api.example.com',
      '/api/users',
      '/users',
      undefined,
      undefined,
      undefined,
      noopLogger,
    );

    expect(mockedCreateProxyMiddleware).toHaveBeenCalledWith(
      expect.objectContaining({
        changeOrigin: true,
        pathRewrite: {
          '^/api/users': '/users',
        },
        target: 'https://api.example.com',
        timeout: DEFAULTS.proxy.timeoutMs,
      }),
    );
  });

  it('creates middleware for different routes', () => {
    createProxyService(
      'https://backend.example.com',
      '/v1/data',
      '/data',
      undefined,
      undefined,
      undefined,
      noopLogger,
    );

    expect(mockedCreateProxyMiddleware).toHaveBeenCalledWith(
      expect.objectContaining({
        changeOrigin: true,
        pathRewrite: {
          '^/v1/data': '/data',
        },
        target: 'https://backend.example.com',
        timeout: DEFAULTS.proxy.timeoutMs,
      }),
    );
  });

  it('returns a RequestHandler', () => {
    const mockHandler = vi.fn();
    mockedCreateProxyMiddleware.mockReturnValue(
      mockHandler as unknown as ReturnType<typeof createProxyMiddleware>,
    );

    const result = createProxyService(
      'https://api.example.com',
      '/api',
      '/api',
      undefined,
      undefined,
      undefined,
      noopLogger,
    );

    expect(typeof result).toBe('function');
  });

  it('returns a wrapper RequestHandler when transform is provided', () => {
    const mockHandler = vi.fn();
    mockedCreateProxyMiddleware.mockReturnValue(
      mockHandler as unknown as ReturnType<typeof createProxyMiddleware>,
    );

    const transform = ({
      body,
    }: {
      body: unknown;
    }): { body: unknown; headers: Record<string, string> } => ({
      body: {
        ...(typeof body === 'object' && body ? body : {}),
        transformed: true,
      },
      headers: { host: 'evil', 'x-custom': 'value' },
    });
    const result = createProxyService(
      'https://api.example.com',
      '/api',
      '/api',
      undefined,
      transform,
      undefined,
      noopLogger,
    );

    const req = {
      body: { key: 'val' },
      headers: { host: 'test' },
    } as unknown as Request;
    const res = {} as unknown as Response;
    const next = vi.fn();
    result(req, res, next);

    expect(req.body).toEqual({ key: 'val', transformed: true });
    expect(req.headers['x-custom']).toBe('value');
    expect(req.headers.host).toBe('test');
  });

  it('does not overwrite set-cookie array headers from transform', () => {
    const mockHandler = vi.fn();
    mockedCreateProxyMiddleware.mockReturnValue(
      mockHandler as unknown as ReturnType<typeof createProxyMiddleware>,
    );

    const transform = (): { body: unknown; headers: Record<string, string> } => ({
      body: {},
      headers: { 'set-cookie': 'injected=value' },
    });
    const result = createProxyService(
      'https://api.example.com',
      '/api',
      '/api',
      undefined,
      transform,
      undefined,
      noopLogger,
    );

    const req = {
      body: {},
      headers: { host: 'test', 'set-cookie': ['a=1', 'b=2'] },
    } as unknown as Request;
    const res = {} as unknown as Response;
    const next = vi.fn();
    result(req, res, next);

    expect(req.headers['set-cookie']).toEqual(['a=1', 'b=2']);
  });

  it('does not overwrite runtime multi-value headers from transform', () => {
    const mockHandler = vi.fn();
    mockedCreateProxyMiddleware.mockReturnValue(
      mockHandler as unknown as ReturnType<typeof createProxyMiddleware>,
    );

    const transform = (): { body: unknown; headers: Record<string, string> } => ({
      body: {},
      headers: { 'x-dup': 'overwritten' },
    });
    const result = createProxyService(
      'https://api.example.com',
      '/api',
      '/api',
      undefined,
      transform,
      undefined,
      noopLogger,
    );

    const req = {
      body: {},
      headers: { host: 'test', 'x-dup': ['val1', 'val2'] },
    } as unknown as Request;
    const res = {} as unknown as Response;
    const next = vi.fn();
    result(req, res, next);

    expect(req.headers['x-dup']).toEqual(['val1', 'val2']);
  });

  it('normalizes transform header keys to lowercase', () => {
    const mockHandler = vi.fn();
    mockedCreateProxyMiddleware.mockReturnValue(
      mockHandler as unknown as ReturnType<typeof createProxyMiddleware>,
    );

    const transform = (): { body: unknown; headers: Record<string, string> } => ({
      body: {},
      headers: { 'X-Another-Header': 'test', 'X-Custom': 'value' },
    });
    const result = createProxyService(
      'https://api.example.com',
      '/api',
      '/api',
      undefined,
      transform,
      undefined,
      noopLogger,
    );

    const req = { body: {}, headers: { host: 'test' } } as unknown as Request;
    const res = {} as unknown as Response;
    const next = vi.fn();
    result(req, res, next);

    expect(req.headers['x-custom']).toBe('value');
    expect(req.headers['x-another-header']).toBe('test');
    expect(req.headers['X-Custom']).toBeUndefined();
    expect(req.headers['X-Another-Header']).toBeUndefined();
  });

  it('allows transform to add a new header not originally present', () => {
    const mockHandler = vi.fn();
    mockedCreateProxyMiddleware.mockReturnValue(
      mockHandler as unknown as ReturnType<typeof createProxyMiddleware>,
    );

    const transform = (): { body: unknown; headers: Record<string, string> } => ({
      body: {},
      headers: { 'x-new': 'added' },
    });
    const result = createProxyService(
      'https://api.example.com',
      '/api',
      '/api',
      undefined,
      transform,
      undefined,
      noopLogger,
    );

    const req = { body: {}, headers: { host: 'test' } } as unknown as Request;
    const res = {} as unknown as Response;
    const next = vi.fn();
    result(req, res, next);

    expect(req.headers['x-new']).toBe('added');
  });

  it('calls next with error when transform throws', () => {
    const mockHandler = vi.fn();
    mockedCreateProxyMiddleware.mockReturnValue(
      mockHandler as unknown as ReturnType<typeof createProxyMiddleware>,
    );

    const spyLogger: Logger = {
      debug: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    };
    const transform = (): never => {
      throw new Error('transform failed');
    };
    const result = createProxyService(
      'https://api.example.com',
      '/api',
      '/api',
      undefined,
      transform,
      undefined,
      spyLogger,
    );

    const req = { body: {}, headers: {} } as unknown as Request;
    const res = {} as unknown as Response;
    const next = vi.fn();
    result(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(next).toHaveBeenCalledTimes(1);
    const err = (next.mock.calls as [[Error]])[0][0];
    expect(err.message).toBe('transform failed');
    expect(spyLogger.error).toHaveBeenCalledWith('[bspa] Transform error:', expect.any(Error));
    expect(mockHandler).not.toHaveBeenCalled();
  });

  it('defaults timeout to 60 seconds when not provided', () => {
    createProxyService(
      'https://api.example.com',
      '/api/users',
      '/users',
      undefined,
      undefined,
      undefined,
      noopLogger,
    );

    expect(mockedCreateProxyMiddleware).toHaveBeenCalledWith(
      expect.objectContaining({
        timeout: 60_000,
      }),
    );
  });

  it('uses custom timeout when provided', () => {
    createProxyService(
      'https://api.example.com',
      '/api/users',
      '/users',
      undefined,
      undefined,
      5000,
      noopLogger,
    );

    expect(mockedCreateProxyMiddleware).toHaveBeenCalledWith(
      expect.objectContaining({
        timeout: 5000,
      }),
    );
  });
});
