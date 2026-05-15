import { createAgentCache } from './proxy.js';

describe('AgentCache', () => {
  let cache: ReturnType<typeof createAgentCache>;

  beforeEach(() => {
    cache = createAgentCache();
  });

  afterEach(() => {
    cache.dispose();
  });

  describe('getAgent', () => {
    it('creates a new agent for a new target', () => {
      const agent = cache.getAgent('https://example.com');
      expect(agent).toBeDefined();
      expect((agent as unknown as Record<string, unknown>).keepAlive).toBe(true);
    });

    it('returns the same agent for the same target', () => {
      const agent1 = cache.getAgent('https://example.com');
      const agent2 = cache.getAgent('https://example.com');
      expect(agent1).toBe(agent2);
    });

    it('creates separate agents for different targets', () => {
      const agent1 = cache.getAgent('https://example.com');
      const agent2 = cache.getAgent('https://other.com');
      expect(agent1).not.toBe(agent2);
    });

    it('creates separate agents for different maxSockets', () => {
      const agent1 = cache.getAgent('https://example.com', 25);
      const agent2 = cache.getAgent('https://example.com', 50);
      expect(agent1).not.toBe(agent2);
    });

    it('evicts oldest agent when cache is full', () => {
      for (let i = 0; i < 100; i++) {
        cache.getAgent(`https://evict${i}.example.com`);
      }
      expect(cache['cache'].size).toBeLessThanOrEqual(100);
    });
  });

  describe('probe', () => {
    it('returns false for localhost on port 443 (no listener)', async () => {
      const result = await cache.probe('https://localhost:443', 1000);
      expect(result).toBe(false);
    }, 2000);

    it('returns false for unreachable host', async () => {
      const result = await cache.probe('https://192.0.2.1:443', 1000);
      expect(result).toBe(false);
    }, 2000);

    it('caches failed probe results', async () => {
      await cache.probe('https://192.0.2.1:443', 500);
      const result = cache.getProbeResult('https://192.0.2.1:443');
      expect(result).toBe(false);
    }, 2000);

    it('accepts hostname-only targets', async () => {
      const result = await cache.probe('192.0.2.1', 1000);
      expect(result).toBe(false);
    }, 2000);

    it('caches probe results for HTTP targets', async () => {
      const result = await cache.probe('http://localhost:80', 1000);
      expect(result).toBe(false);
      expect(cache.getProbeResult('http://localhost:80')).toBe(false);
    }, 2000);

    it('caches probe results for HTTPS targets', async () => {
      const result = await cache.probe('https://localhost:443', 1000);
      expect(result).toBe(false);
      expect(cache.getProbeResult('https://localhost:443')).toBe(false);
    }, 2000);

    it('returns cached result for re-probed target', async () => {
      await cache.probe('https://localhost:443', 1000);
      const result1 = cache.getProbeResult('https://localhost:443');
      await cache.probe('https://localhost:443', 1000);
      const result2 = cache.getProbeResult('https://localhost:443');
      expect(result1).toBe(result2);
    }, 2000);
  });

  describe('getProbeResult', () => {
    it('returns undefined for never-probed targets', () => {
      const result = cache.getProbeResult('https://never-probed.example.com');
      expect(result).toBeUndefined();
    });

    it('returns the last probe result', async () => {
      await cache.probe('https://example.com:443', 1000);
      const result1 = cache.getProbeResult('https://example.com:443');
      expect(result1).not.toBeUndefined();
    }, 2000);

    it('handles targets without http prefix', () => {
      const result = cache.getProbeResult('example.com');
      expect(result).toBeUndefined();
    });
  });

  describe('dispose', () => {
    it('clears all cached agents', () => {
      cache.getAgent('https://example.com');
      cache.dispose();
      expect(cache['cache'].size).toBe(0);
    });

    it('clears all probe results', async () => {
      await cache.probe('https://example.com:443', 1000);
      cache.dispose();
      expect(cache['probeResults'].size).toBe(0);
    }, 2000);
  });
});
