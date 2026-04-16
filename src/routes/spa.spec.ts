import path from 'node:path';
import { createSpaHandler } from './spa';

describe('createSpaHandler', () => {
  it('returns 404 for /api paths', () => {
    const handler = createSpaHandler({ root: '/var/www', basePath: '/', fallback: 'index.html' });

    const req = { path: '/api/users' } as any;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as any;
    const next = vi.fn();

    handler(req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Not Found' });
  });

  it('sends file for root path', () => {
    const handler = createSpaHandler({ root: '/var/www', basePath: '/', fallback: 'index.html' });

    const req = { path: '/' } as any;
    const res = {
      sendFile: vi.fn(),
    } as any;
    const next = vi.fn();

    handler(req, res, next);

    expect(res.sendFile).toHaveBeenCalledWith(path.join('/var/www', '/'), expect.any(Function));
  });

  it('sends file for specific path', () => {
    const handler = createSpaHandler({ root: '/var/www', basePath: '/', fallback: 'index.html' });

    const req = { path: '/about' } as any;
    const res = {
      sendFile: vi.fn(),
    } as any;
    const next = vi.fn();

    handler(req, res, next);

    expect(res.sendFile).toHaveBeenCalledWith(
      path.join('/var/www', '/about'),
      expect.any(Function)
    );
  });

  it('falls back to index.html on file error', () => {
    const handler = createSpaHandler({ root: '/var/www', basePath: '/', fallback: 'index.html' });

    const req = { path: '/nonexistent' } as any;
    const res = {
      sendFile: vi.fn(),
    } as any;
    const next = vi.fn();

    handler(req, res, next);

    const sendFileCallback = res.sendFile.mock.calls[0][1];
    const fakeError = new Error('File not found');

    sendFileCallback(fakeError);

    expect(res.sendFile).toHaveBeenCalledTimes(2);
    expect(res.sendFile.mock.calls[1][0]).toBe(path.join('/var/www', 'index.html'));
  });

  it('does not call fallback on success', () => {
    const handler = createSpaHandler({ root: '/var/www', basePath: '/', fallback: 'index.html' });

    const req = { path: '/styles.css' } as any;
    const res = {
      sendFile: vi.fn(),
    } as any;
    const next = vi.fn();

    handler(req, res, next);

    const sendFileCallback = res.sendFile.mock.calls[0][1];

    sendFileCallback(null);

    expect(res.sendFile).toHaveBeenCalledTimes(1);
  });

  it('uses custom fallback file', () => {
    const handler = createSpaHandler({ root: '/public', basePath: '/', fallback: 'app.html' });

    const req = { path: '/deep/nested/route' } as any;
    const res = {
      sendFile: vi.fn(),
    } as any;
    const next = vi.fn();

    handler(req, res, next);

    const sendFileCallback = res.sendFile.mock.calls[0][1];
    sendFileCallback(new Error('Not found'));

    expect(res.sendFile.mock.calls[1][0]).toBe(path.join('/public', 'app.html'));
  });
});
