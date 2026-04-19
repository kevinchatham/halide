import { createProxyMiddleware } from 'http-proxy-middleware';
import { DEFAULTS } from '../config/defaults';
import { createProxyService } from './proxy';

vi.mock('http-proxy-middleware', () => ({
  createProxyMiddleware: vi.fn(),
}));

const mockedCreateProxyMiddleware = vi.mocked(createProxyMiddleware);

describe('createProxyService', () => {
  beforeEach(() => {
    mockedCreateProxyMiddleware.mockClear();
  });

  it('creates proxy middleware with correct configuration', () => {
    createProxyService('https://api.example.com', '/api/users', '/users');

    expect(mockedCreateProxyMiddleware).toHaveBeenCalledWith(
      expect.objectContaining({
        target: 'https://api.example.com',
        changeOrigin: true,
        timeout: DEFAULTS.proxy.timeoutMs,
        pathRewrite: {
          '^/api/users': '/users',
        },
      })
    );
  });

  it('creates middleware for different routes', () => {
    createProxyService('https://backend.example.com', '/v1/data', '/data');

    expect(mockedCreateProxyMiddleware).toHaveBeenCalledWith(
      expect.objectContaining({
        target: 'https://backend.example.com',
        changeOrigin: true,
        timeout: DEFAULTS.proxy.timeoutMs,
        pathRewrite: {
          '^/v1/data': '/data',
        },
      })
    );
  });

  it('returns a RequestHandler', () => {
    const mockHandler = vi.fn();
    mockedCreateProxyMiddleware.mockReturnValue(mockHandler as any);

    const result = createProxyService('https://api.example.com', '/api', '/api');

    expect(typeof result).toBe('function');
  });

  it('returns a wrapper RequestHandler when transform is provided', () => {
    const mockHandler = vi.fn((_req: any, _res: any, next: any) => next());
    mockedCreateProxyMiddleware.mockReturnValue(mockHandler as any);

    const transform = ({ body }: { body: unknown }) => ({
      body: { ...(typeof body === 'object' && body ? body : {}), transformed: true },
      headers: { 'x-custom': 'value', host: 'evil' },
    });
    const result = createProxyService(
      'https://api.example.com',
      '/api',
      '/api',
      undefined,
      transform
    );

    const req = { body: { key: 'val' }, headers: { host: 'test' } } as any;
    const res = {} as any;
    const next = vi.fn();
    result(req, res, next);

    expect(req.body).toEqual({ key: 'val', transformed: true });
    expect(req.headers['x-custom']).toBe('value');
    expect(req.headers['host']).toBe('test');
  });

  it('does not overwrite set-cookie array headers from transform', () => {
    const mockHandler = vi.fn((_req: any, _res: any, next: any) => next());
    mockedCreateProxyMiddleware.mockReturnValue(mockHandler as any);

    const transform = () => ({
      body: {},
      headers: { 'set-cookie': 'injected=value' },
    });
    const result = createProxyService(
      'https://api.example.com',
      '/api',
      '/api',
      undefined,
      transform
    );

    const req = {
      body: {},
      headers: { 'set-cookie': ['a=1', 'b=2'], host: 'test' },
    } as any;
    const res = {} as any;
    const next = vi.fn();
    result(req, res, next);

    expect(req.headers['set-cookie']).toEqual(['a=1', 'b=2']);
  });

  it('does not overwrite runtime multi-value headers from transform', () => {
    const mockHandler = vi.fn((_req: any, _res: any, next: any) => next());
    mockedCreateProxyMiddleware.mockReturnValue(mockHandler as any);

    const transform = () => ({
      body: {},
      headers: { 'x-dup': 'overwritten' },
    });
    const result = createProxyService(
      'https://api.example.com',
      '/api',
      '/api',
      undefined,
      transform
    );

    const req = {
      body: {},
      headers: { 'x-dup': ['val1', 'val2'], host: 'test' },
    } as any;
    const res = {} as any;
    const next = vi.fn();
    result(req, res, next);

    expect(req.headers['x-dup']).toEqual(['val1', 'val2']);
  });

  it('normalizes transform header keys to lowercase', () => {
    const mockHandler = vi.fn((_req: any, _res: any, next: any) => next());
    mockedCreateProxyMiddleware.mockReturnValue(mockHandler as any);

    const transform = () => ({
      body: {},
      headers: { 'X-Custom': 'value', 'X-Another-Header': 'test' },
    });
    const result = createProxyService(
      'https://api.example.com',
      '/api',
      '/api',
      undefined,
      transform
    );

    const req = { body: {}, headers: { host: 'test' } } as any;
    const res = {} as any;
    const next = vi.fn();
    result(req, res, next);

    expect(req.headers['x-custom']).toBe('value');
    expect(req.headers['x-another-header']).toBe('test');
    expect(req.headers['X-Custom']).toBeUndefined();
    expect(req.headers['X-Another-Header']).toBeUndefined();
  });

  it('allows transform to add a new header not originally present', () => {
    const mockHandler = vi.fn((_req: any, _res: any, next: any) => next());
    mockedCreateProxyMiddleware.mockReturnValue(mockHandler as any);

    const transform = () => ({
      body: {},
      headers: { 'x-new': 'added' },
    });
    const result = createProxyService(
      'https://api.example.com',
      '/api',
      '/api',
      undefined,
      transform
    );

    const req = { body: {}, headers: { host: 'test' } } as any;
    const res = {} as any;
    const next = vi.fn();
    result(req, res, next);

    expect(req.headers['x-new']).toBe('added');
  });

  it('calls next with error when transform throws', () => {
    const mockHandler = vi.fn();
    mockedCreateProxyMiddleware.mockReturnValue(mockHandler as any);

    const transform = () => {
      throw new Error('transform failed');
    };
    const result = createProxyService(
      'https://api.example.com',
      '/api',
      '/api',
      undefined,
      transform
    );

    const req = { body: {}, headers: {} } as any;
    const res = {} as any;
    const next = vi.fn();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    result(req, res, next);
    vi.restoreAllMocks();

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(next).toHaveBeenCalledTimes(1);
    const err = (next.mock.calls as [[Error]])[0][0];
    expect(err.message).toBe('transform failed');
    expect(mockHandler).not.toHaveBeenCalled();
  });

  it('defaults timeout to 60 seconds when not provided', () => {
    createProxyService('https://api.example.com', '/api/users', '/users');

    expect(mockedCreateProxyMiddleware).toHaveBeenCalledWith(
      expect.objectContaining({
        timeout: 60_000,
      })
    );
  });

  it('uses custom timeout when provided', () => {
    createProxyService(
      'https://api.example.com',
      '/api/users',
      '/users',
      undefined,
      undefined,
      5000
    );

    expect(mockedCreateProxyMiddleware).toHaveBeenCalledWith(
      expect.objectContaining({
        timeout: 5000,
      })
    );
  });
});
