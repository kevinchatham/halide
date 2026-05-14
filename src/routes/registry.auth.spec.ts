import { Hono } from 'hono';
import { sign } from 'hono/jwt';
import { createSecurityMiddleware } from '../middleware/security';
import { createOpenApiRoutes } from '../middleware/swagger';
import { createAgentCache } from '../services/proxy';
import { createTestApp, noopLogger } from '../test-utils/index.js';
import type { HalideVariables } from '../types/app';
import type { ServerConfig } from '../types/server-config';
import { registerRoutes } from './registry';
import { createClaimExtractor, NOOP_EXTRACTOR_CACHE } from './registry.auth';

const secret = 'test-secret';

async function createValidToken(claims: Record<string, unknown>): Promise<string> {
  return sign(claims, secret, 'HS256');
}

describe('registerRoutes — auth', () => {
  beforeEach(() => {
    NOOP_EXTRACTOR_CACHE.reset();
  });
  describe('Authentication', () => {
    it('returns 401 for private routes without token', async () => {
      const app = await createTestApp({
        apiRoutes: [
          {
            access: 'private',
            handler: async () => ({ ok: true }),
            path: '/profile',
            type: 'api',
          },
        ],
        app: { root: '/var/www' },
        security: { auth: { secret: () => secret, strategy: 'bearer' } },
      });

      const res = await app.request('/profile');
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body).toEqual({ error: 'Unauthorized' });
    });

    it('returns 401 for private routes with invalid token', async () => {
      const app = await createTestApp({
        apiRoutes: [
          {
            access: 'private',
            handler: async () => ({ ok: true }),
            path: '/profile',
            type: 'api',
          },
        ],
        app: { root: '/var/www' },
        security: { auth: { secret: () => secret, strategy: 'bearer' } },
      });

      const res = await app.request('/profile', {
        headers: { authorization: 'Bearer invalid-token' },
      });
      expect(res.status).toBe(401);
    });

    it('allows private routes with valid token', async () => {
      const token = await createValidToken({ role: 'admin', sub: 'user-123' });
      const app = await createTestApp({
        apiRoutes: [
          {
            access: 'private',
            handler: async (_ctx: unknown, claims: unknown) => ({ user: claims }),
            path: '/profile',
            type: 'api',
          },
        ],
        app: { root: '/var/www' },
        security: { auth: { secret: () => secret, strategy: 'bearer' } },
      });

      const res = await app.request('/profile', {
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.status).toBe(200);
    });
  });

  describe('JWKS strategy', () => {
    it('uses JWKS auth when strategy is jwks', async () => {
      const app = await createTestApp({
        apiRoutes: [
          {
            access: 'private',
            handler: async () => ({ ok: true }),
            path: '/profile',
            type: 'api',
          },
        ],
        app: { root: '/var/www' },
        security: {
          auth: {
            jwksUri: 'https://auth.example.com/.well-known/jwks.json',
            strategy: 'jwks',
          },
        },
      });

      const res = await app.request('/profile');
      expect(res.status).toBe(401);
    });
  });

  describe('Bearer secretTtl caching', () => {
    it('caches secret and only calls secret function once within TTL', async () => {
      vi.useFakeTimers();
      const secretFn = vi.fn().mockReturnValue('test-secret');
      const app = await createTestApp({
        apiRoutes: [
          {
            access: 'private',
            handler: async () => ({ ok: true }),
            path: '/profile',
            type: 'api',
          },
        ],
        app: { root: '/var/www' },
        security: {
          auth: { secret: secretFn, secretTtl: 60, strategy: 'bearer' },
        },
      });

      const token = await createValidToken({ sub: 'user-123' });

      const res1 = await app.request('/profile', {
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res1.status).toBe(200);
      expect(secretFn).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(30_000);

      const res2 = await app.request('/profile', {
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res2.status).toBe(200);
      expect(secretFn).toHaveBeenCalledTimes(1);

      vi.useRealTimers();
    });

    it('re-fetches secret after TTL expires', async () => {
      vi.useFakeTimers();
      const secretFn = vi.fn().mockReturnValue('test-secret');
      const app = await createTestApp({
        apiRoutes: [
          {
            access: 'private',
            handler: async () => ({ ok: true }),
            path: '/profile',
            type: 'api',
          },
        ],
        app: { root: '/var/www' },
        security: {
          auth: { secret: secretFn, secretTtl: 60, strategy: 'bearer' },
        },
      });

      const token = await createValidToken({ sub: 'user-123' });

      await app.request('/profile', {
        headers: { authorization: `Bearer ${token}` },
      });
      expect(secretFn).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(61_000);

      await app.request('/profile', {
        headers: { authorization: `Bearer ${token}` },
      });
      expect(secretFn).toHaveBeenCalledTimes(2);

      vi.useRealTimers();
    });

    it('does not cache when secretTtl is 0', async () => {
      const secretFn = vi.fn().mockReturnValue('test-secret');
      const app = await createTestApp({
        apiRoutes: [
          {
            access: 'private',
            handler: async () => ({ ok: true }),
            path: '/profile',
            type: 'api',
          },
        ],
        app: { root: '/var/www' },
        security: {
          auth: { secret: secretFn, secretTtl: 0, strategy: 'bearer' },
        },
      });

      const token = await createValidToken({ sub: 'user-123' });

      const res1 = await app.request('/profile', {
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res1.status).toBe(200);
      expect(secretFn).toHaveBeenCalledTimes(1);

      const res2 = await app.request('/profile', {
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res2.status).toBe(200);
      expect(secretFn).toHaveBeenCalledTimes(2);
    });
  });

  describe('Auth config without secret or jwks', () => {
    it('returns undefined claimExtractor when auth has no secret or jwks', async () => {
      const app = await createTestApp({
        apiRoutes: [
          {
            access: 'private',
            handler: async () => ({ ok: true }),
            path: '/profile',
            type: 'api',
          },
        ],
        app: { root: '/var/www' },
        security: { auth: { strategy: 'bearer' } },
      });

      const res = await app.request('/profile');
      expect(res.status).toBe(200);
    });
  });

  describe('claimExtractorCache', () => {
    it('tracks cache size', () => {
      expect(NOOP_EXTRACTOR_CACHE.size).toBe(0);
    });

    it('caches extractors by strategy key', () => {
      const bearerConfig = {
        apiRoutes: [],
        security: { auth: { secret: () => 'bearer-secret', strategy: 'bearer' } },
      } as ServerConfig;
      const jwksConfig = {
        apiRoutes: [],
        security: {
          auth: { jwksUri: 'https://auth.example.com/.well-known/jwks.json', strategy: 'jwks' },
        },
      } as ServerConfig;

      createClaimExtractor(bearerConfig, noopLogger);
      createClaimExtractor(jwksConfig, noopLogger);

      expect(NOOP_EXTRACTOR_CACHE.size).toBe(2);
    });
  });

  describe('CSP headers on auth error responses', () => {
    it('includes CSP header on 401 auth error', async () => {
      const app = new Hono<{ Variables: HalideVariables }>();
      const agentCache = createAgentCache();

      app.use('*', createSecurityMiddleware({ defaultSrc: ["'self'"] }));
      registerRoutes(
        app,
        {
          apiRoutes: [
            {
              access: 'private',
              handler: async () => ({ ok: true }),
              path: '/profile',
              type: 'api',
            },
          ],
          app: { root: '/var/www' },
          security: { auth: { secret: () => secret, strategy: 'bearer' } },
        },
        noopLogger,
        agentCache,
      );
      createOpenApiRoutes({} as ServerConfig, app as unknown as Hono);

      const res = await app.request('/profile');
      expect(res.status).toBe(401);
      const csp = res.headers.get('Content-Security-Policy');
      expect(csp).toContain("'self'");
    });

    it('includes CSP header on 403 authorization error', async () => {
      const app = new Hono<{ Variables: HalideVariables }>();
      const agentCache = createAgentCache();

      app.use('*', createSecurityMiddleware({ defaultSrc: ["'none'"] }));
      registerRoutes(
        app,
        {
          apiRoutes: [
            {
              access: 'private',
              authorize: async () => false,
              handler: async () => ({ ok: true }),
              path: '/restricted',
              type: 'api',
            },
          ],
          app: { root: '/var/www' },
          security: {
            auth: { secret: () => secret, strategy: 'bearer' },
          },
        },
        noopLogger,
        agentCache,
      );
      createOpenApiRoutes({} as ServerConfig, app as unknown as Hono);

      const token = await createValidToken({ role: 'admin', sub: 'user-123' });
      const res = await app.request('/restricted', {
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.status).toBe(403);
      const csp = res.headers.get('Content-Security-Policy');
      expect(csp).toContain("'none'");
    });
  });
});
