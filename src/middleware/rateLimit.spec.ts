import type { NextFunction, Request, Response } from 'express';
import { createRateLimitMiddleware, resetRateLimitStore } from './rateLimit';

describe('createRateLimitMiddleware', () => {
  beforeEach(() => {
    resetRateLimitStore();
  });

  function makeMockRequest(ip?: string, forwardedFor?: string): Request {
    return {
      ip,
      headers: forwardedFor ? { 'x-forwarded-for': forwardedFor } : {},
    } as unknown as Request;
  }

  function makeMockResponse(): {
    res: Response;
    next: NextFunction;
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
    set: ReturnType<typeof vi.fn>;
  } {
    const status = vi.fn().mockReturnThis();
    const json = vi.fn();
    const set = vi.fn();
    const res = { status, json, set } as unknown as Response;
    return { res, next: vi.fn() as unknown as NextFunction, status, json, set };
  }

  it('allows requests within the limit', () => {
    const middleware = createRateLimitMiddleware({ windowMs: 1000, maxRequests: 2 });
    const req = makeMockRequest('127.0.0.1');
    const { res, next } = makeMockResponse();

    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('blocks requests exceeding the limit', () => {
    const middleware = createRateLimitMiddleware({ windowMs: 1000, maxRequests: 2 });
    const { res, next } = makeMockResponse();
    const req = makeMockRequest('127.0.0.1');

    middleware(req, res, next);
    middleware(req, res, next);
    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(2);
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith({ error: 'Too Many Requests' });
  });

  it('includes Retry-After header on 429 response', () => {
    const middleware = createRateLimitMiddleware({ windowMs: 1000, maxRequests: 1 });
    const { res, set, next } = makeMockResponse();
    const req = makeMockRequest('127.0.0.1');

    middleware(req, res, next);
    middleware(req, res, next);

    expect(set).toHaveBeenCalledWith('Retry-After', expect.any(String));
  });

  it('resets window after time expires', () => {
    vi.useFakeTimers();
    const middleware = createRateLimitMiddleware({ windowMs: 1000, maxRequests: 1 });
    const req = makeMockRequest('127.0.0.1');

    const { res: res1, next: next1 } = makeMockResponse();
    middleware(req, res1, next1);

    const { res: res2, next: next2 } = makeMockResponse();
    middleware(req, res2, next2);
    expect(next2).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1100);

    const { res: res3, next: next3 } = makeMockResponse();
    middleware(req, res3, next3);
    expect(next3).toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('tracks different IPs separately', () => {
    const middleware = createRateLimitMiddleware({ windowMs: 1000, maxRequests: 1 });
    const req1 = makeMockRequest('127.0.0.1');
    const req2 = makeMockRequest('192.168.1.1');

    const { res: res1, next: next1 } = makeMockResponse();
    middleware(req1, res1, next1);

    const { res: res2, next: next2 } = makeMockResponse();
    middleware(req2, res2, next2);

    expect(next1).toHaveBeenCalled();
    expect(next2).toHaveBeenCalled();
  });

  it('uses X-Forwarded-For for client identification', () => {
    const middleware = createRateLimitMiddleware({ windowMs: 1000, maxRequests: 1 });
    const req = makeMockRequest('127.0.0.1', '10.0.0.1');

    const { res: res1, next: next1 } = makeMockResponse();
    middleware(req, res1, next1);

    const req2 = makeMockRequest('127.0.0.1', '10.0.0.1');
    const { res: res2, next: next2 } = makeMockResponse();
    middleware(req2, res2, next2);

    expect(next1).toHaveBeenCalled();
    expect(next2).not.toHaveBeenCalled();
    expect(res2.status).toHaveBeenCalledWith(429);
  });
});
