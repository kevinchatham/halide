import type { Logger } from '../config/types';
import { createErrorHandler } from './errorHandler';

const logger: Logger = {
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
};

describe('createErrorHandler', () => {
  it('logs the error with method and path', () => {
    const handler = createErrorHandler(logger);

    const req = { method: 'GET', path: '/test' } as any;
    const res = {
      json: vi.fn().mockReturnThis(),
      locals: {},
      status: vi.fn().mockReturnThis(),
    } as any;
    const next = vi.fn();
    const error = new Error('Test error');

    handler(error, req, res, next);

    expect(logger.error).toHaveBeenCalledWith('[error] GET /test:', error);
  });

  it('returns 500 with error message', () => {
    const handler = createErrorHandler(logger);

    const req = { method: 'POST', path: '/api/data' } as any;
    const res = {
      json: vi.fn().mockReturnThis(),
      locals: {},
      status: vi.fn().mockReturnThis(),
    } as any;
    const next = vi.fn();
    const error = new Error('Something broke');

    handler(error, req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal Server Error' });
  });

  it('handles errors without a message', () => {
    const handler = createErrorHandler(logger);

    const req = { method: 'DELETE', path: '/resource' } as any;
    const res = {
      json: vi.fn().mockReturnThis(),
      locals: {},
      status: vi.fn().mockReturnThis(),
    } as any;
    const next = vi.fn();

    handler(new Error(), req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal Server Error' });
  });

  it('stores Error instances in res.locals.error', () => {
    const handler = createErrorHandler(logger);

    const req = { method: 'GET', path: '/test' } as any;
    const res = {
      json: vi.fn().mockReturnThis(),
      locals: {},
      status: vi.fn().mockReturnThis(),
    } as any;
    const next = vi.fn();
    const error = new Error('boom');

    handler(error, req, res, next);

    expect(res.locals.error).toBe(error);
  });

  it('wraps non-Error values in res.locals.error', () => {
    const handler = createErrorHandler(logger);

    const req = { method: 'GET', path: '/test' } as any;
    const res = {
      json: vi.fn().mockReturnThis(),
      locals: {},
      status: vi.fn().mockReturnThis(),
    } as any;
    const next = vi.fn();

    handler('string error', req, res, next);

    expect(res.locals.error).toBeInstanceOf(Error);
    expect(res.locals.error.message).toBe('string error');
  });
});
