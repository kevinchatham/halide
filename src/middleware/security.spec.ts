import { createSecurityMiddleware } from './security';

describe('createSecurityMiddleware', () => {
  it('creates middleware with default directives', () => {
    const handler = createSecurityMiddleware({});
    expect(typeof handler).toBe('function');
    expect(handler.length).toBe(3);
  });

  it('applies helmet with default directives', () => {
    const handler = createSecurityMiddleware({});

    const req = { method: 'GET', path: '/', headers: {} } as any;
    const res = {
      setHeader: vi.fn(),
      getHeader: vi.fn(),
      removeHeader: vi.fn(),
    } as any;
    const next = vi.fn();

    handler(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Security-Policy',
      expect.stringContaining("'self'")
    );
  });

  it('uses custom directives when provided', () => {
    const handler = createSecurityMiddleware({
      defaultSrc: ["'self'"],
      scriptSrc: ["'none'"],
    });

    const req = { method: 'GET', path: '/', headers: {} } as any;
    const res = {
      setHeader: vi.fn(),
      getHeader: vi.fn(),
      removeHeader: vi.fn(),
    } as any;
    const next = vi.fn();

    handler(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Security-Policy',
      expect.stringContaining("'none'")
    );
  });

  it('calls next after applying helmet', () => {
    const handler = createSecurityMiddleware({});

    const req = { method: 'GET', path: '/', headers: {} } as any;
    const res = {
      setHeader: vi.fn(),
      getHeader: vi.fn(),
      removeHeader: vi.fn(),
    } as any;
    const next = vi.fn();

    handler(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});
