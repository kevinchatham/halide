import { noopLogger } from '../test-utils/index.js';
import type { ServerConfig } from '../types/server-config';
import { createClaimExtractor } from './registry.claims';

describe('createClaimExtractor', () => {
  it('returns undefined when no auth is configured', () => {
    const config = { apiRoutes: [] } as ServerConfig;
    expect(
      createClaimExtractor(config, noopLogger as import('../types/app').Logger<unknown>),
    ).toBeUndefined();
  });
});
