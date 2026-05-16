import { noopLogger } from '../test-utils/index.js';
import type { ServerConfig } from '../types/server-config';
import { createClaimExtractor, NOOP_EXTRACTOR_CACHE } from './registry.claims';

describe('claimExtractorCache', () => {
  beforeEach(() => {
    NOOP_EXTRACTOR_CACHE.reset();
  });

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

    createClaimExtractor(bearerConfig, noopLogger as import('../types/app').Logger<unknown>);
    createClaimExtractor(jwksConfig, noopLogger as import('../types/app').Logger<unknown>);

    expect(NOOP_EXTRACTOR_CACHE.size).toBe(2);
  });
});
