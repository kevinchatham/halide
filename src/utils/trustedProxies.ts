import ipaddr from 'ipaddr.js';

/**
 * Check if an IP address matches a trusted proxy list using CIDR or exact matching.
 *
 * Uses the `ipaddr.js` library to parse both IPv4 and IPv6 addresses and
 * match them against CIDR ranges (e.g., `10.0.0.0/8`) or exact IPs.
 *
 * @param ip - The IP address to check.
 * @param trustedProxies - List of trusted proxy IPs or CIDR ranges (e.g., `['127.0.0.1', '10.0.0.0/8']`).
 * @returns True if the IP matches a trusted proxy, false otherwise.
 */
export function isTrustedProxy(ip: string | undefined, trustedProxies?: string[]): boolean {
  if (!trustedProxies?.length || !ip) return false;
  const addr = ipaddr.parse(ip);
  return trustedProxies.some((tp) => {
    if (tp.includes('/')) {
      const [net, prefix] = tp.split('/');
      const parsedNet = ipaddr.parse(net);
      return addr.match(parsedNet, Number(prefix));
    }
    return addr.toString() === tp;
  });
}

/**
 * Extract the client IP from request headers, falling back to socket IP.
 *
 * Uses `X-Forwarded-For` only when the socket IP is from a trusted proxy
 * (verified via {@link isTrustedProxy}). Returns the first IP from the
 * `X-Forwarded-For` header when trusted, otherwise the raw socket IP.
 *
 * @param socketIp - The socket IP from `req.socket.remoteAddress`.
 * @param trustedProxies - List of trusted proxy IPs or CIDR ranges.
 * @param forwardedHeader - The `X-Forwarded-For` header value, if present.
 * @returns The client IP address.
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
