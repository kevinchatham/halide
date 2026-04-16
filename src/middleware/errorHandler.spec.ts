import { createErrorHandler } from './errorHandler';

describe('createErrorHandler', () => {
  it('logs the error with method and path', () => {
    const handler = createErrorHandler();
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const req = { method: 'GET', path: '/test' } as any;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as any;
    const next = vi.fn();
    const error = new Error('Test error');

    handler(error, req, res, next);

    expect(consoleSpy).toHaveBeenCalledWith('[error] GET /test:', error);

    consoleSpy.mockRestore();
  });

  it('returns 500 with error message', () => {
    const handler = createErrorHandler();

    const req = { method: 'POST', path: '/api/data' } as any;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as any;
    const next = vi.fn();
    const error = new Error('Something broke');

    vi.spyOn(console, 'error').mockImplementation(() => {});

    handler(error, req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal Server Error' });

    vi.restoreAllMocks();
  });

  it('handles errors without a message', () => {
    const handler = createErrorHandler();

    const req = { method: 'DELETE', path: '/resource' } as any;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as any;
    const next = vi.fn();

    vi.spyOn(console, 'error').mockImplementation(() => {});

    handler(new Error(), req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal Server Error' });

    vi.restoreAllMocks();
  });
});
