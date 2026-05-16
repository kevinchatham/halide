import { Hono } from 'hono';
import type { Logger, RequestContext } from '../types/app';
import { createErrorHandler } from './errorHandler';

const logger = {
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
} as Logger<unknown> & {
  debug: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  info: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
};

describe('createErrorHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('logs error details and returns 500', async () => {
    const app = new Hono();
    const handler = createErrorHandler(logger);
    app.onError(handler);
    app.post('/api/data', () => {
      throw new Error('Something broke');
    });

    const res = await app.request('/api/data', { method: 'POST' });

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: 'Internal Server Error' });
    expect(logger.error).toHaveBeenCalled();
    const call = logger.error.mock.calls[0]!;
    expect(call[0]).toHaveProperty('errorStack');
    expect(call[1]).toContain('Something broke');
  });

  it('returns 500 with error message', async () => {
    const app = new Hono();
    const handler = createErrorHandler(logger);
    app.onError(handler);
    app.post('/api/data', () => {
      throw new Error('test');
    });

    const res = await app.request('/api/data', { method: 'POST' });

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: 'Internal Server Error' });
  });

  it('handles errors without a message', async () => {
    const app = new Hono();
    const handler = createErrorHandler(logger);
    app.onError(handler);
    app.delete('/resource', () => {
      throw new Error();
    });

    const res = await app.request('/resource', { method: 'DELETE' });

    expect(res.status).toBe(500);
  });

  it('handles non-Error thrown values', () => {
    const handler = createErrorHandler(logger);
    const mockJson = vi.fn().mockReturnValue(new Response());
    const mockContext = {
      json: mockJson,
      req: { method: 'GET', path: '/test' },
    } as unknown as Parameters<typeof handler>[1];

    handler('string error', mockContext);

    expect(mockJson).toHaveBeenCalledWith({ error: 'Internal Server Error' }, 500);
    expect(logger.error).toHaveBeenCalled();
    const call = logger.error.mock.calls[0]!;
    expect(call[1]).toContain('string error');
  });

  it('respects error status code', async () => {
    const app = new Hono();
    const handler = createErrorHandler(logger);
    app.onError(handler);
    app.delete('/resource', () => {
      const err = new Error('not found') as unknown as Error & { status: number };
      err.status = 404;
      throw err;
    });

    const res = await app.request('/resource', { method: 'DELETE' });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ error: 'Internal Server Error' });
  });

  it('preserves valid 5xx status codes', async () => {
    const app = new Hono();
    const handler = createErrorHandler(logger);
    app.onError(handler);
    app.delete('/resource', () => {
      const err = new Error('service unavailable') as unknown as Error & { status: number };
      err.status = 503;
      throw err;
    });

    const res = await app.request('/resource', { method: 'DELETE' });

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toEqual({ error: 'Internal Server Error' });
  });

  it('calls logScopeFactory and merges scope into logger call', () => {
    const factory =
      vi.fn<(ctx: RequestContext, claims: unknown) => { userId: string; path: string }>();
    factory.mockReturnValue({ path: '/fail', userId: 'user-1' });
    const handler = createErrorHandler(logger, factory);
    const reqCtx = {
      headers: {},
      method: 'get',
      params: {},
      path: '/fail',
      query: {},
    } satisfies RequestContext;
    const appCtx = { claims: 'user-1', logger };
    const mockJson = vi.fn().mockReturnValue(new Response());
    const mockContext = {
      get: (key: string) => {
        if (key === 'reqCtx') return reqCtx;
        if (key === 'appCtx') return appCtx;
        return undefined;
      },
      json: mockJson,
      req: { method: 'GET', path: '/fail' },
    } as unknown as Parameters<typeof handler>[1];

    handler(new Error('boom'), mockContext);

    expect(mockJson).toHaveBeenCalledWith({ error: 'Internal Server Error' }, 500);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(factory).toHaveBeenCalledWith(reqCtx, appCtx.claims);
    expect(logger.error).toHaveBeenCalled();
    const call = logger.error.mock.calls[0]!;
    const scope = call[0] as { userId: string; path: string; errorStack?: string };
    expect(scope).toHaveProperty('userId', 'user-1');
    expect(scope).toHaveProperty('path', '/fail');
    expect(scope).toHaveProperty('errorStack');
    expect(call[1]).toContain('boom');
  });
});
