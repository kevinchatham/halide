import { buildHonoApp } from '../utils/hono';
import { createRequestIdMiddleware } from './requestId';

describe('createRequestIdMiddleware', () => {
  it('sets x-request-id header with a generated UUID when no header is provided', async () => {
    const app = buildHonoApp();
    app.use(createRequestIdMiddleware());
    app.get('/test', (c) => c.text('ok'));

    const res = await app.request('/test');

    expect(res.headers.get('x-request-id')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('preserves an existing x-request-id header from the request', async () => {
    const app = buildHonoApp();
    app.use(createRequestIdMiddleware());
    app.get('/test', (c) => c.text('ok'));

    const res = await app.request('/test', {
      headers: { 'x-request-id': 'custom-id-123' },
    });

    expect(res.headers.get('x-request-id')).toBe('custom-id-123');
  });

  it('generates different IDs for separate requests', async () => {
    const app = buildHonoApp();
    app.use(createRequestIdMiddleware());
    app.get('/test', (c) => c.text('ok'));

    const res1 = await app.request('/test');
    const res2 = await app.request('/test');

    expect(res1.headers.get('x-request-id')).not.toBe(res2.headers.get('x-request-id'));
  });
});
