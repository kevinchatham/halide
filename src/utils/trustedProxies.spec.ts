import { getClientIp, isTrustedProxy } from './trustedProxies';

describe('isTrustedProxy', () => {
  it('returns false for undefined IP', () => {
    expect(isTrustedProxy(undefined, ['127.0.0.1'])).toBe(false);
  });

  it('returns false for undefined trustedProxies', () => {
    expect(isTrustedProxy('127.0.0.1')).toBe(false);
  });

  it('returns false for empty trustedProxies', () => {
    expect(isTrustedProxy('127.0.0.1', [])).toBe(false);
  });

  it('matches exact IP', () => {
    expect(isTrustedProxy('127.0.0.1', ['127.0.0.1'])).toBe(true);
  });

  it('rejects non-matching exact IP', () => {
    expect(isTrustedProxy('192.168.1.1', ['127.0.0.1'])).toBe(false);
  });

  it('matches CIDR range', () => {
    expect(isTrustedProxy('10.0.0.50', ['10.0.0.0/24'])).toBe(true);
  });

  it('rejects IP outside CIDR range', () => {
    expect(isTrustedProxy('10.0.1.1', ['10.0.0.0/24'])).toBe(false);
  });

  it('matches multiple trusted proxies', () => {
    expect(isTrustedProxy('172.16.0.1', ['127.0.0.1', '172.16.0.0/16'])).toBe(true);
  });

  it('rejects when no trusted proxy matches', () => {
    expect(isTrustedProxy('192.168.1.100', ['10.0.0.0/24', '172.16.0.0/16'])).toBe(false);
  });
});

describe('getClientIp', () => {
  it('returns socket IP when not trusted', () => {
    expect(getClientIp('192.168.1.1', ['127.0.0.1'], '10.0.0.1')).toBe('192.168.1.1');
  });

  it('returns first IP from x-forwarded-for when trusted', () => {
    expect(getClientIp('127.0.0.1', ['127.0.0.1'], '10.0.0.1, 10.0.0.2')).toBe('10.0.0.1');
  });

  it('strips whitespace from forwarded IP', () => {
    expect(getClientIp('127.0.0.1', ['127.0.0.1'], ' 10.0.0.1 , 10.0.0.2')).toBe('10.0.0.1');
  });

  it('returns socket IP when forwarded header is empty string', () => {
    expect(getClientIp('127.0.0.1', ['127.0.0.1'], '')).toBe('127.0.0.1');
  });

  it('returns socket IP when forwarded header is undefined', () => {
    expect(getClientIp('127.0.0.1', ['127.0.0.1'], undefined)).toBe('127.0.0.1');
  });

  it('returns socket IP when no trusted proxies configured', () => {
    expect(getClientIp('127.0.0.1', undefined, '10.0.0.1')).toBe('127.0.0.1');
  });

  it('returns socket IP when trusted proxies is empty', () => {
    expect(getClientIp('127.0.0.1', [], '10.0.0.1')).toBe('127.0.0.1');
  });

  it('matches CIDR trusted proxy', () => {
    expect(getClientIp('10.0.0.50', ['10.0.0.0/24'], '10.0.0.100')).toBe('10.0.0.100');
  });
});
