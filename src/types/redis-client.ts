/**
 * Minimal Redis client interface for rate limiting.
 *
 * Implementations can use `ioredis`, `redis`, or any client that supports
 * these core commands. Used for distributed rate limiting across multiple
 * server instances.
 */
export interface RedisClient {
  /** Delete the given key. Returns the number of keys removed. */
  del(key: string): Promise<number>;
  /** Set the expiration (in seconds) for the given key. Returns 1 if the timeout was set, 0 otherwise. */
  expire(key: string, seconds: number): Promise<number>;
  /** Get the value of the given key. Returns null if the key does not exist. */
  get(key: string): Promise<string | null>;
  /** Increment the integer value of the given key by 1. Returns the new value. */
  incr(key: string): Promise<number>;
  /** Get the remaining time to live (in milliseconds) for the given key. */
  pttl(key: string): Promise<number>;
  /** Set the value of the given key with optional expiration. Returns `'OK'` on success. */
  set(key: string, value: string, opts?: { EX?: number }): Promise<'OK'>;
}
