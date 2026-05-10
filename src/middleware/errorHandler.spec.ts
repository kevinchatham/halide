import { Hono } from 'hono';
import type { Logger } from '../types/app';
import { createErrorHandler } from './errorHandler';

const logger: Logger<unknown> = {
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
};

describe('createErrorHandler', () => {
  it('returns 500 with error message', async () => {
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
  });
});
