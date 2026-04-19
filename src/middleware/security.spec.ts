import type { Request, Response } from 'express';
import { createSecurityMiddleware } from './security';

describe('createSecurityMiddleware', () => {
  it('creates middleware with default directives', () => {
    const handler = createSecurityMiddleware({ directives: undefined });
    expect(typeof handler).toBe('function');
    expect(handler.length).toBe(3);
  });

  it('applies helmet with default directives', () => {
    const handler = createSecurityMiddleware({ directives: undefined });

    const req = { headers: {}, method: 'GET', path: '/' } as unknown as Request;
    const res = {
      getHeader: vi.fn(),
      removeHeader: vi.fn(),
      setHeader: vi.fn(),
    } as unknown as Response;
    const next = vi.fn();

    handler(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Security-Policy',
      expect.stringContaining("'self'"),
    );
  });

  it('uses custom directives when provided', () => {
    const handler = createSecurityMiddleware({
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'none'"],
      },
    });

    const req = { headers: {}, method: 'GET', path: '/' } as unknown as Request;
    const res = {
      getHeader: vi.fn(),
      removeHeader: vi.fn(),
      setHeader: vi.fn(),
    } as unknown as Response;
    const next = vi.fn();

    handler(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Security-Policy',
      expect.stringContaining("'none'"),
    );
  });

  it('calls next after applying helmet', () => {
    const handler = createSecurityMiddleware({ directives: undefined });

    const req = { headers: {}, method: 'GET', path: '/' } as unknown as Request;
    const res = {
      getHeader: vi.fn(),
      removeHeader: vi.fn(),
      setHeader: vi.fn(),
    } as unknown as Response;
    const next = vi.fn();

    handler(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});
