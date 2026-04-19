import type { NextFunction, Request, Response } from 'express';
import { createRateLimitMiddleware } from './rateLimit';

describe('createRateLimitMiddleware', () => {
  function makeMockRequest(ip?: string, forwardedFor?: string): Request {
    return {
      headers: forwardedFor ? { 'x-forwarded-for': forwardedFor } : {},
      ip,
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
    const res = { json, set, status } as unknown as Response;
    return { json, next: vi.fn() as unknown as NextFunction, res, set, status };
  }

  let disposeFns: Array<() => void>;

  beforeEach(() => {
    disposeFns = [];
  });

  afterEach(() => {
    for (const dispose of disposeFns) {
      dispose();
    }
  });

  function create(config: { windowMs: number; maxRequests: number }) {
    const { middleware, dispose } = createRateLimitMiddleware(config);
    disposeFns.push(dispose);
    return middleware;
  }

  it('allows requests within the limit', () => {
    const middleware = create({ maxRequests: 2, windowMs: 1000 });
    const req = makeMockRequest('127.0.0.1');
    const { res, next } = makeMockResponse();

    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('blocks requests exceeding the limit', () => {
    const middleware = create({ maxRequests: 2, windowMs: 1000 });
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
    const middleware = create({ maxRequests: 1, windowMs: 1000 });
    const { res, set, next } = makeMockResponse();
    const req = makeMockRequest('127.0.0.1');

    middleware(req, res, next);
    middleware(req, res, next);

    expect(set).toHaveBeenCalledWith('Retry-After', expect.any(String));
  });

  it('resets window after time expires', () => {
    vi.useFakeTimers();
    const middleware = create({ maxRequests: 1, windowMs: 1000 });
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
    const middleware = create({ maxRequests: 1, windowMs: 1000 });
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
    const middleware = create({ maxRequests: 1, windowMs: 1000 });
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
