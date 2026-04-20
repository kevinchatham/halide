import { defaultAuthorize } from '../config/defaults';
import { proxyRoute } from './proxyRoute';

describe('proxyRoute', () => {
  it('sets type to proxy', () => {
    const route = proxyRoute({
      access: 'public',
      methods: ['get'],
      path: '/users',
      target: 'https://api.example.com',
    });
    expect(route.type).toBe('proxy');
  });

  it('defaults authorize to defaultAuthorize when not provided', () => {
    const route = proxyRoute({
      access: 'public',
      methods: ['get'],
      path: '/users',
      target: 'https://api.example.com',
    });
    expect(route.authorize).toBe(defaultAuthorize);
  });

  it('preserves custom authorize when provided', () => {
    const customAuth = async (): Promise<boolean> => false;
    const route = proxyRoute({
      access: 'public',
      authorize: customAuth,
      methods: ['get'],
      path: '/users',
      target: 'https://api.example.com',
    });
    expect(route.authorize).toBe(customAuth);
  });

  it('spreads all input properties', () => {
    const route = proxyRoute({
      access: 'public',
      methods: ['get', 'post'],
      path: '/users',
      proxyPath: '/api/users',
      target: 'https://api.example.com',
      timeout: 5000,
    });
    expect(route.access).toBe('public');
    expect(route.methods).toEqual(['get', 'post']);
    expect(route.path).toBe('/users');
    expect(route.proxyPath).toBe('/api/users');
    expect(route.target).toBe('https://api.example.com');
    expect(route.timeout).toBe(5000);
  });

  it('preserves observe when set to false', () => {
    const route = proxyRoute({
      access: 'public',
      methods: ['get'],
      observe: false,
      path: '/users',
      target: 'https://api.example.com',
    });
    expect(route.observe).toBe(false);
  });

  it('preserves transform function', () => {
    const transformFn = (req: {
      body: unknown;
      headers: Record<string, string>;
    }): { body: unknown; headers: Record<string, string> } => req;
    const route = proxyRoute({
      access: 'public',
      methods: ['post'],
      path: '/api',
      target: 'https://api.example.com',
      transform: transformFn,
    });
    expect(route.transform).toBe(transformFn);
  });

  it('preserves identity function', () => {
    const identityFn = (): Record<string, string> => ({ 'x-user': 'test' });
    const route = proxyRoute({
      access: 'public',
      identity: identityFn,
      methods: ['get'],
      path: '/api',
      target: 'https://api.example.com',
    });
    expect(route.identity).toBe(identityFn);
  });

  it('works with typed claims', () => {
    type MyClaims = { role: string };
    const route = proxyRoute<MyClaims>({
      access: 'private',
      methods: ['get'],
      path: '/admin',
      target: 'https://api.example.com',
    });
    expect(route.type).toBe('proxy');
    expect(route.access).toBe('private');
  });
});
