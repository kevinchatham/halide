import ipaddr from 'ipaddr.js';

/** Check if an IP address matches a trusted proxy list using CIDR or exact matching. */
export function isTrustedProxy(ip: string | undefined, trustedProxies?: string[]): boolean {
  if (!trustedProxies?.length || !ip) return false;
  const addr = ipaddr.parse(ip);
  return trustedProxies.some((tp) => {
    if (tp.includes('/')) {
      const [net, prefix] = tp.split('/');
      const parsedNet = ipaddr.parse(net!);
      return addr!.match(parsedNet, Number(prefix));
    }
    return addr!.toString() === tp;
  });
}

/**
 * Extract the client IP from request headers, falling back to socket IP.
 * Uses X-Forwarded-For only when the socket IP is from a trusted proxy.
 */
export function getClientIp(
  socketIp: string,
  trustedProxies?: string[],
  forwardedHeader?: string,
): string {
  if (isTrustedProxy(socketIp, trustedProxies) && forwardedHeader) {
    const first = forwardedHeader.split(',')[0];
    if (first) return first.trim();
  }
  return socketIp;
}
