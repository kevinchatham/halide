import path from 'node:path';
import type { RequestHandler } from 'express';
import { createSpaHandler } from './spa';

function getFallbackMiddleware(spaConfig: Parameters<typeof createSpaHandler>[0]): RequestHandler {
  const middlewares = createSpaHandler(spaConfig);
  return middlewares[1] as RequestHandler;
}

describe('createSpaHandler', () => {
  it('returns two middlewares (static + fallback)', () => {
    const middlewares = createSpaHandler({
      name: 'test-app',
      root: '/var/www',
      fallback: 'index.html',
    });

    expect(middlewares).toHaveLength(2);
    expect(typeof middlewares[0]).toBe('function');
    expect(typeof middlewares[1]).toBe('function');
  });

  it('fallback returns 404 for /api paths', () => {
    const fallback = getFallbackMiddleware({
      name: 'test-app',
      root: '/var/www',
      fallback: 'index.html',
    });

    const req = { path: '/api/users' } as any;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as any;
    const next = vi.fn();

    fallback(req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Not Found' });
  });

  it('fallback sends index.html for non-api paths', () => {
    const fallback = getFallbackMiddleware({
      name: 'test-app',
      root: '/var/www',
      fallback: 'index.html',
    });

    const req = { path: '/about' } as any;
    const res = {
      sendFile: vi.fn(),
    } as any;
    const next = vi.fn();

    fallback(req, res, next);

    expect(res.sendFile).toHaveBeenCalledWith(
      path.join('/var/www', 'index.html'),
      expect.any(Function)
    );
  });

  it('uses custom fallback file', () => {
    const fallback = getFallbackMiddleware({
      name: 'test-app',
      root: '/public',
      fallback: 'app.html',
    });

    const req = { path: '/deep/nested/route' } as any;
    const res = {
      sendFile: vi.fn(),
    } as any;
    const next = vi.fn();

    fallback(req, res, next);

    expect(res.sendFile).toHaveBeenCalledWith(
      path.join('/public', 'app.html'),
      expect.any(Function)
    );
  });

  it('fallback calls next on sendFile error', () => {
    const fallback = getFallbackMiddleware({
      name: 'test-app',
      root: '/var/www',
      fallback: 'index.html',
    });

    const req = { path: '/about' } as any;
    const res = {
      sendFile: vi.fn(),
    } as any;
    const next = vi.fn();

    fallback(req, res, next);

    const sendFileCallback = res.sendFile.mock.calls[0][1];
    const fakeError = new Error('File not found');

    sendFileCallback(fakeError);

    expect(next).toHaveBeenCalledWith(fakeError);
  });

  it('fallback returns 404 for paths matching custom apiPrefix', () => {
    const fallback = getFallbackMiddleware({
      apiPrefix: '/v1',
      name: 'test-app',
      root: '/var/www',
      fallback: 'index.html',
    });

    const req = { path: '/v1/users' } as any;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as any;
    const next = vi.fn();

    fallback(req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Not Found' });
  });

  it('fallback serves index.html when apiPrefix is empty string', () => {
    const fallback = getFallbackMiddleware({
      apiPrefix: '',
      name: 'test-app',
      root: '/var/www',
      fallback: 'index.html',
    });

    const req = { path: '/api/users' } as any;
    const res = {
      sendFile: vi.fn(),
    } as any;
    const next = vi.fn();

    fallback(req, res, next);

    expect(res.sendFile).toHaveBeenCalledWith(
      path.join('/var/www', 'index.html'),
      expect.any(Function)
    );
  });

  it('fallback serves index.html for paths not matching custom apiPrefix', () => {
    const fallback = getFallbackMiddleware({
      apiPrefix: '/graphql',
      name: 'test-app',
      root: '/var/www',
      fallback: 'index.html',
    });

    const req = { path: '/about' } as any;
    const res = {
      sendFile: vi.fn(),
    } as any;
    const next = vi.fn();

    fallback(req, res, next);

    expect(res.sendFile).toHaveBeenCalledWith(
      path.join('/var/www', 'index.html'),
      expect.any(Function)
    );
  });
});
