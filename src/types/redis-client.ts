export interface RedisClient {
  del(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  get(key: string): Promise<string | null>;
  incr(key: string): Promise<number>;
  pttl(key: string): Promise<number>;
  set(key: string, value: string, opts?: { EX?: number }): Promise<'OK'>;
}
