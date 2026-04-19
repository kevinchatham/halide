import path from 'node:path';
import type { Request, RequestHandler, Response } from 'express';
import { createSpaHandler } from './spa';

function getFallbackMiddleware(spaConfig: Parameters<typeof createSpaHandler>[0]): RequestHandler {
  const middlewares = createSpaHandler(spaConfig);
  return middlewares[1] as unknown as RequestHandler;
}

describe('createSpaHandler', () => {
  it('returns two middlewares (static + fallback)', () => {
    const middlewares = createSpaHandler({
      fallback: 'index.html',
      name: 'test-app',
      root: '/var/www',
    });

    expect(middlewares).toHaveLength(2);
    expect(typeof middlewares[0]).toBe('function');
    expect(typeof middlewares[1]).toBe('function');
  });

  it('fallback returns 404 for /api paths', () => {
    const fallback = getFallbackMiddleware({
      fallback: 'index.html',
      name: 'test-app',
      root: '/var/www',
    });

    const req = { path: '/api/users' } as unknown as Request;
    const res = {
      json: vi.fn().mockReturnThis(),
      status: vi.fn().mockReturnThis(),
    } as unknown as Response;
    const next = vi.fn();

    fallback(req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Not Found' });
  });

  it('fallback sends index.html for non-api paths', () => {
    const fallback = getFallbackMiddleware({
      fallback: 'index.html',
      name: 'test-app',
      root: '/var/www',
    });

    const req = { path: '/about' } as unknown as Request;
    const res = {
      sendFile: vi.fn(),
    } as unknown as Response;
    const next = vi.fn();

    fallback(req, res, next);

    expect(res.sendFile).toHaveBeenCalledWith(
      path.join('/var/www', 'index.html'),
      expect.any(Function),
    );
  });

  it('uses custom fallback file', () => {
    const fallback = getFallbackMiddleware({
      fallback: 'app.html',
      name: 'test-app',
      root: '/public',
    });

    const req = { path: '/deep/nested/route' } as unknown as Request;
    const res = {
      sendFile: vi.fn(),
    } as unknown as Response;
    const next = vi.fn();

    fallback(req, res, next);

    expect(res.sendFile).toHaveBeenCalledWith(
      path.join('/public', 'app.html'),
      expect.any(Function),
    );
  });

  it('fallback calls next on sendFile error', () => {
    const fallback = getFallbackMiddleware({
      fallback: 'index.html',
      name: 'test-app',
      root: '/var/www',
    });

    const req = { path: '/about' } as unknown as Request;
    const res = {
      sendFile: vi.fn(),
    } as unknown as Response;
    const next = vi.fn();

    fallback(req, res, next);

    const sendFileCallback = (res.sendFile as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0]![1];
    const fakeError = new Error('File not found');

    sendFileCallback(fakeError);

    expect(next).toHaveBeenCalledWith(fakeError);
  });

  it('fallback returns 404 for paths matching custom apiPrefix', () => {
    const fallback = getFallbackMiddleware({
      apiPrefix: '/v1',
      fallback: 'index.html',
      name: 'test-app',
      root: '/var/www',
    });

    const req = { path: '/v1/users' } as unknown as Request;
    const res = {
      json: vi.fn().mockReturnThis(),
      status: vi.fn().mockReturnThis(),
    } as unknown as Response;
    const next = vi.fn();

    fallback(req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Not Found' });
  });

  it('fallback serves index.html when apiPrefix is empty string', () => {
    const fallback = getFallbackMiddleware({
      apiPrefix: '',
      fallback: 'index.html',
      name: 'test-app',
      root: '/var/www',
    });

    const req = { path: '/api/users' } as unknown as Request;
    const res = {
      sendFile: vi.fn(),
    } as unknown as Response;
    const next = vi.fn();

    fallback(req, res, next);

    expect(res.sendFile).toHaveBeenCalledWith(
      path.join('/var/www', 'index.html'),
      expect.any(Function),
    );
  });

  it('fallback serves index.html for paths not matching custom apiPrefix', () => {
    const fallback = getFallbackMiddleware({
      apiPrefix: '/graphql',
      fallback: 'index.html',
      name: 'test-app',
      root: '/var/www',
    });

    const req = { path: '/about' } as unknown as Request;
    const res = {
      sendFile: vi.fn(),
    } as unknown as Response;
    const next = vi.fn();

    fallback(req, res, next);

    expect(res.sendFile).toHaveBeenCalledWith(
      path.join('/var/www', 'index.html'),
      expect.any(Function),
    );
  });
});
