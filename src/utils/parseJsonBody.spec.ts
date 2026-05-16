import type { HonoApp } from '../types/app';
import { buildHonoApp } from './hono';
import { BodyParseError, parseJsonBody } from './parseJsonBody';

describe('parseJsonBody', () => {
  function createApp(
    handler: (c: Parameters<typeof parseJsonBody>[0]) => Promise<unknown>,
  ): HonoApp {
    const app = buildHonoApp();
    app.post('/test', async (c) => {
      try {
        const body = await handler(c);
        return c.json({ parsed: body });
      } catch (e) {
        if (e instanceof BodyParseError) return c.json({ error: e.message }, 400);
        throw e;
      }
    });
    return app;
  }

  it('parses valid JSON', async () => {
    const app = createApp((c) => parseJsonBody(c));
    const res = await app.request('/test', {
      body: JSON.stringify({ key: 'value' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.parsed).toEqual({ key: 'value' });
  });

  it('returns 400 on malformed JSON', async () => {
    const app = createApp((c) => parseJsonBody(c));
    const res = await app.request('/test', {
      body: '{invalid json}',
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ error: 'Malformed JSON in request body' });
  });

  it('returns 400 on non-JSON content', async () => {
    const app = createApp((c) => parseJsonBody(c));
    const res = await app.request('/test', {
      body: 'not json at all',
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 on empty body with JSON content type', async () => {
    const app = createApp((c) => parseJsonBody(c));
    const res = await app.request('/test', {
      body: '',
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    expect(res.status).toBe(400);
  });
});
