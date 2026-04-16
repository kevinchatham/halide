import { createSecurityMiddleware } from './security';

describe('createSecurityMiddleware', () => {
  it('creates middleware for strict CSP mode', () => {
    const handler = createSecurityMiddleware('strict');
    expect(typeof handler).toBe('function');
    expect(handler.length).toBe(3);
  });

  it('creates middleware for relaxed CSP mode', () => {
    const handler = createSecurityMiddleware('relaxed');
    expect(typeof handler).toBe('function');
    expect(handler.length).toBe(3);
  });

  it('strict mode applies helmet with restrictive directives', () => {
    const handler = createSecurityMiddleware('strict');

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

  it('relaxed mode does not set CSP header', () => {
    const handler = createSecurityMiddleware('relaxed');

    const req = { method: 'GET', path: '/', headers: {} } as any;
    const res = {
      setHeader: vi.fn(),
      getHeader: vi.fn(),
      removeHeader: vi.fn(),
    } as any;
    const next = vi.fn();

    handler(req, res, next);

    const cspCalls = res.setHeader.mock.calls.filter(
      (call: any[]) => call[0] === 'Content-Security-Policy'
    );
    expect(cspCalls).toHaveLength(0);
  });

  it('calls next after applying helmet', () => {
    const handler = createSecurityMiddleware('strict');

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
