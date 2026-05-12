import type { Logger } from '../types/app';
import { createSecretCache } from './secretCache';

const mockLogger: Logger<unknown> = {
  debug: (_scope: unknown) => {},
  error: vi.fn(),
  info: (_scope: unknown) => {},
  warn: (_scope: unknown) => {},
};

describe('createSecretCache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns fresh value when cache is empty', async () => {
    const fetcher = vi.fn().mockResolvedValue('secret-1');
    const resolver = createSecretCache(60, mockLogger);

    const result = await resolver(fetcher);

    expect(result).toBe('secret-1');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('returns cached value when not expired', async () => {
    const fetcher = vi.fn().mockResolvedValue('secret-1');
    const resolver = createSecretCache(60, mockLogger);

    await resolver(fetcher);
    vi.advanceTimersByTime(30_000);
    const result = await resolver(fetcher);

    expect(result).toBe('secret-1');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('re-fetches after TTL expires', async () => {
    const fetcher = vi.fn();
    fetcher.mockResolvedValueOnce('secret-1');
    fetcher.mockResolvedValueOnce('secret-2');
    const resolver = createSecretCache(60, mockLogger);

    const first = await resolver(fetcher);
    expect(first).toBe('secret-1');

    vi.advanceTimersByTime(61_000);

    const second = await resolver(fetcher);
    expect(second).toBe('secret-2');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('disables caching when ttlSeconds is 0', async () => {
    const fetcher = vi.fn();
    fetcher.mockResolvedValueOnce('secret-1');
    fetcher.mockResolvedValueOnce('secret-2');
    const resolver = createSecretCache(0, mockLogger);

    const first = await resolver(fetcher);
    const second = await resolver(fetcher);

    expect(first).toBe('secret-1');
    expect(second).toBe('secret-2');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('logs error and re-throws when fetcher fails', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('Vault unavailable'));
    const resolver = createSecretCache(60, mockLogger);

    await expect(resolver(fetcher)).rejects.toThrow('Vault unavailable');

    expect(mockLogger.error).toHaveBeenCalledWith(
      { error: 'secret_refresh_failed' },
      'Failed to refresh JWT secret from secret provider:',
      'Vault unavailable',
    );
  });

  it('does not cache failures — next call retries', async () => {
    const fetcher = vi.fn();
    fetcher.mockRejectedValueOnce(new Error('Vault unavailable'));
    fetcher.mockResolvedValueOnce('secret-1');
    const resolver = createSecretCache(60, mockLogger);

    await expect(resolver(fetcher)).rejects.toThrow();
    const result = await resolver(fetcher);

    expect(result).toBe('secret-1');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('handles non-Error throws values', async () => {
    const fetcher = vi.fn().mockRejectedValue('string error');
    const resolver = createSecretCache(60, mockLogger);

    await expect(resolver(fetcher)).rejects.toBe('string error');

    expect(mockLogger.error).toHaveBeenCalledWith(
      { error: 'secret_refresh_failed' },
      'Failed to refresh JWT secret from secret provider:',
      'string error',
    );
  });
});
