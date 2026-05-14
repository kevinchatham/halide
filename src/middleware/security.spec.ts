import { Hono } from 'hono';
import { createSecurityMiddleware } from './security';

describe('createSecurityMiddleware', () => {
  it('creates middleware with default directives', () => {
    const handler = createSecurityMiddleware({});
    expect(typeof handler).toBe('function');
  });

  it('applies secureHeaders with default directives', async () => {
    const app = new Hono();
    app.use('*', createSecurityMiddleware({}));
    app.get('/test', (c) => c.json({ ok: true }));

    const res = await app.request('/test');

    const csp = res.headers.get('Content-Security-Policy');
    expect(csp).toContain("'self'");
  });

  it('uses custom directives when provided', async () => {
    const app = new Hono();
    app.use(
      '*',
      createSecurityMiddleware({
        defaultSrc: ["'self'"],
        scriptSrc: ["'none'"],
      }),
    );
    app.get('/test', (c) => c.json({ ok: true }));

    const res = await app.request('/test');

    const csp = res.headers.get('Content-Security-Policy');
    expect(csp).toContain("'none'");
  });

  it('calls next after applying secureHeaders', async () => {
    const app = new Hono();
    app.use('*', createSecurityMiddleware({}));
    app.get('/test', (c) => c.json({ ok: true }));

    const res = await app.request('/test');

    expect(res.status).toBe(200);
  });

  it('merges overrides into CSP directives', async () => {
    const app = new Hono();
    app.use(
      '*',
      createSecurityMiddleware(
        {},
        {
          connectSrc: ["'self'", 'https:'],
          scriptSrc: ["'self'", 'https://cdn.jsdelivr.net', "'unsafe-inline'"],
        },
      ),
    );
    app.get('/test', (c) => c.json({ ok: true }));

    const res = await app.request('/test');
    const csp = res.headers.get('Content-Security-Policy') ?? '';

    expect(csp).toContain("'unsafe-inline'");
    expect(csp).toContain('https://cdn.jsdelivr.net');
    expect(csp).toContain('https:');
  });
});
