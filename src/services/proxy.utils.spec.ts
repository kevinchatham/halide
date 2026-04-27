import { Hono } from 'hono';
import type { Logger } from '../types';
import { buildRequestContextFromHono, serializeQueryParam } from './proxy';

const _noopLogger: Logger = {
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
};

describe('serializeQueryParam', () => {
  it('serializes string values', () => {
    expect(serializeQueryParam('hello')).toBe('hello');
  });

  it('serializes non-string values as JSON', () => {
    expect(serializeQueryParam(42)).toBe('42');
    expect(serializeQueryParam(true)).toBe('true');
  });

  it('serializes array values', () => {
    expect(serializeQueryParam(['a', 'b'])).toEqual(['a', 'b']);
  });

  it('serializes arrays with non-string items as JSON', () => {
    expect(serializeQueryParam([1, 'b'])).toEqual(['1', 'b']);
  });
});

describe('buildRequestContextFromHono', () => {
  it('builds context from Hono request', async () => {
    const app = new Hono();
    let result: ReturnType<typeof buildRequestContextFromHono> | undefined;
    app.get('/users/:id', (c) => {
      result = buildRequestContextFromHono(c, { name: 'test' });
      return c.json({});
    });

    await app.request('/users/123?active=true', {
      headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
    });

    expect(result).toBeDefined();
    expect(result!.method).toBe('get');
    expect(result!.path).toBe('/users/123');
    expect(result!.params).toEqual({ id: '123' });
    expect(result!.query).toEqual({ active: 'true' });
    expect(result!.body).toEqual({ name: 'test' });
  });

  it('handles requests without query params', async () => {
    const app = new Hono();
    let result: ReturnType<typeof buildRequestContextFromHono> | undefined;
    app.get('/test', (c) => {
      result = buildRequestContextFromHono(c);
      return c.json({});
    });

    await app.request('/test');

    expect(result).toBeDefined();
    expect(result!.query).toEqual({});
    expect(result!.body).toBeUndefined();
  });
});
