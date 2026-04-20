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

  it('preserves validationSchema', () => {
    const schema = { parse: (v: unknown): unknown => v } as never;
    const route = apiRoute({ access: 'public', handler, path: '/items', validationSchema: schema });
    expect(route.validationSchema).toBe(schema);
  });

  it('works with typed claims', () => {
    type MyClaims = { role: string };
    const route = apiRoute<MyClaims, { name: string }>({
      access: 'private',
      handler: async (_ctx: unknown, _claims: unknown): Promise<{ ok: boolean }> => ({ ok: true }),
      path: '/items',
    });
    expect(route.type).toBe('api');
    expect(route.access).toBe('private');
  });
});
