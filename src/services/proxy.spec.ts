import { createProxyMiddleware } from 'http-proxy-middleware';
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

    expect(result).toBe(mockHandler);
  });
});
