import { Hono } from 'hono';
import { noopLogger } from '../test-utils/index.js';
import type { HalideVariables } from '../types/app';
import { createContextMiddleware } from './registry.context';

type TestVariables = HalideVariables & { claims?: unknown };

describe('createContextMiddleware', () => {
  it('stores reqCtx and appCtx on context', async () => {
    const app = new Hono<{ Variables: TestVariables }>();
    let capturedAppCtx: unknown;
    let capturedReqCtx: unknown;

    app.use('*', createContextMiddleware(noopLogger));
    app.get('/test', (c) => {
      capturedAppCtx = c.get('appCtx');
      capturedReqCtx = c.get('reqCtx');
      return c.json({ ok: true });
    });

    const res = await app.request('/test');
    expect(res.status).toBe(200);
    expect(capturedReqCtx).toBeDefined();
    expect(capturedReqCtx).toHaveProperty('method', 'get');
    expect(capturedReqCtx).toHaveProperty('path', '/test');
    expect(capturedAppCtx).toBeDefined();
    expect(capturedAppCtx).toHaveProperty('claims', undefined);
  });

  it('passes claims from context to appCtx', async () => {
    const app = new Hono<{ Variables: TestVariables }>();
    let capturedClaims: unknown;

    app.use('*', async (c, next) => {
      c.set('claims', { role: 'admin', sub: 'user-123' });
      await next();
    });
    app.use('*', createContextMiddleware(noopLogger));
    app.get('/test', (c) => {
      const appCtx = c.get('appCtx');
      capturedClaims = appCtx?.claims;
      return c.json({ ok: true });
    });

    await app.request('/test');
    expect(capturedClaims).toEqual({ role: 'admin', sub: 'user-123' });
  });

  it('creates scoped logger when logScopeFactory is provided', async () => {
    const baseLogger = {
      debug: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    };
    const scopeValue = { requestId: 'req-456' };
    const logScopeFactory = (_ctx: unknown, _claims: unknown): { requestId: string } => scopeValue;

    const app = new Hono<{ Variables: TestVariables }>();
    let capturedLogger: unknown;

    app.use('*', createContextMiddleware(baseLogger, logScopeFactory));
    app.get('/test', (c) => {
      const appCtx = c.get('appCtx');
      capturedLogger = appCtx?.logger;
      return c.json({ ok: true });
    });

    await app.request('/test');
    expect(capturedLogger).toBeDefined();
    expect(capturedLogger).not.toBe(baseLogger);

    if (capturedLogger && typeof capturedLogger === 'object' && 'info' in capturedLogger) {
      const logger = capturedLogger as { info: (_s: unknown, ...args: unknown[]) => void };
      logger.info(undefined, 'test message');
      expect(baseLogger.info).toHaveBeenCalledWith(scopeValue, 'test message');
    }
  });

  it('uses base logger when logScopeFactory is not provided', async () => {
    const baseLogger = {
      debug: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    };

    const app = new Hono<{ Variables: TestVariables }>();
    let capturedLogger: unknown;

    app.use('*', createContextMiddleware(baseLogger));
    app.get('/test', (c) => {
      const appCtx = c.get('appCtx');
      capturedLogger = appCtx?.logger;
      return c.json({ ok: true });
    });

    await app.request('/test');
    expect(capturedLogger).toBe(baseLogger);
  });

  it('calls next() to continue middleware chain', async () => {
    const app = new Hono<{ Variables: TestVariables }>();
    let handlerCalled = false;

    app.use('*', createContextMiddleware(noopLogger));
    app.get('/test', () => {
      handlerCalled = true;
      return new Response('ok');
    });

    const res = await app.request('/test');
    expect(handlerCalled).toBe(true);
    expect(res.status).toBe(200);
  });
});
