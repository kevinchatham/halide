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
    createProxyService('https://api.example.com', '/api/users');

    expect(mockedCreateProxyMiddleware).toHaveBeenCalledWith({
      target: 'https://api.example.com',
      changeOrigin: true,
      pathRewrite: {
        '^/api/users': '',
      },
    });
  });

  it('creates middleware for different routes', () => {
    createProxyService('https://backend.example.com', '/v1/data');

    expect(mockedCreateProxyMiddleware).toHaveBeenCalledWith({
      target: 'https://backend.example.com',
      changeOrigin: true,
      pathRewrite: {
        '^/v1/data': '',
      },
    });
  });

  it('returns a RequestHandler', () => {
    const mockHandler = vi.fn();
    mockedCreateProxyMiddleware.mockReturnValue(mockHandler as any);

    const result = createProxyService('https://api.example.com', '/api');

    expect(result).toBe(mockHandler);
  });
});
