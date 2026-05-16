import { defaultAuthorize } from '../config/defaults';
import { apiRoute } from './apiRoute';

const handler = async (): Promise<{ ok: boolean }> => ({ ok: true });

describe('apiRoute', () => {
  it('sets type to api', () => {
    const route = apiRoute({ access: 'public', handler, path: '/items' });
    expect(route.type).toBe('api');
  });

  it('defaults authorize to defaultAuthorize when not provided', () => {
    const route = apiRoute({ access: 'public', handler, path: '/items' });
    expect(route.authorize).toBe(defaultAuthorize);
  });

  it('preserves custom authorize when provided', () => {
    const customAuth = async (): Promise<boolean> => false;
    const route = apiRoute({ access: 'public', authorize: customAuth, handler, path: '/items' });
    expect(route.authorize).toBe(customAuth);
  });

  it('spreads all input properties', () => {
    const route = apiRoute({ access: 'public', handler, method: 'post', path: '/items' });
    expect(route.access).toBe('public');
    expect(route.method).toBe('post');
    expect(route.path).toBe('/items');
    expect(route.handler).toBe(handler);
  });

  it('preserves observe when set to false', () => {
    const route = apiRoute({ access: 'public', handler, observe: false, path: '/items' });
    expect(route.observe).toBe(false);
  });

  it('preserves requestSchema', () => {
    const schema = { parse: (v: unknown): unknown => v } as never;
    const route = apiRoute({ access: 'public', handler, path: '/items', requestSchema: schema });
    expect(route.requestSchema).toBe(schema);
  });

  it('preserves responseSchema', () => {
    const schema = { parse: (v: unknown): unknown => v } as never;
    const route = apiRoute({ access: 'public', handler, path: '/items', responseSchema: schema });
    expect(route.responseSchema).toBe(schema);
  });

  it('works with typed claims and log scope', () => {
    type MyClaims = { role: string };
    type MyLogScope = { requestId: string };
    const route = apiRoute<MyClaims, MyLogScope, { name: string }, { ok: boolean }>({
      access: 'private',
      handler: async (_ctx: unknown, _app: unknown): Promise<{ ok: boolean }> => ({ ok: true }),
      path: '/items',
    });
    expect(route.type).toBe('api');
    expect(route.access).toBe('private');
  });
});
