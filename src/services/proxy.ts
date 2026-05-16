import http from 'node:http';
import net from 'node:net';
import tls from 'node:tls';
import type { Context } from 'hono';
import { proxy } from 'hono/proxy';
import { MAX_AGENT_CACHE } from '../config/constants';
import { DEFAULTS } from '../config/defaults';
import type { HalideContext, ProxyRoute } from '../types/api';
import type { AnyHalideContext, Logger, RequestContext } from '../types/app';
import { isTrustedProxy } from '../utils/trustedProxies';

/** Cached HTTP agent pool with bounded size. */
export class AgentCache {
  private readonly cache = new Map<string, http.Agent>();
  private probeResults = new Map<string, boolean>();

  getAgent(target: string): http.Agent {
    const key = `${target}`;
    let agent = this.cache.get(key);
    if (!agent) {
      if (this.cache.size >= MAX_AGENT_CACHE) {
        const firstKey = this.cache.keys().next().value;
        if (firstKey) {
          const evicted = this.cache.get(firstKey);
          evicted?.destroy();
          this.cache.delete(firstKey);
        }
      }
      agent = new http.Agent({
        keepAlive: true,
        maxFreeSockets: DEFAULTS.proxy.maxFreeSockets,
        maxSockets: DEFAULTS.proxy.maxSockets,
      });
      this.cache.set(key, agent);
    }
    return agent;
  }

  /** Build a probe cache key from a target URL. */
  private static probeKeyFor(target: string): string {
    const u = new URL(target.startsWith('http') ? target : `https://${target}`);
    return `${u.hostname}:${u.port}`;
  }

  /**
   * Probe a target URL to check if the upstream is reachable.
   *
   * For HTTPS targets, opens a TLS connection with certificate verification.
   * For HTTP targets, opens a plain TCP connection.
   *
   * @param target - The target URL to probe (e.g., `https://api.example.com/v1`).
   * @param timeoutMs - Connection timeout in milliseconds. Defaults to 5000.
   * @returns `true` if the connection succeeds, `false` otherwise.
   */
  async probe(target: string, timeoutMs?: number): Promise<boolean> {
    const url = new URL(target.startsWith('http') ? target : `https://${target}`);
    const probeKey = `${url.hostname}:${url.port}`;
    const timeout = timeoutMs ?? 5_000;

    const port = url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80;

    try {
      await new Promise<void>((resolve, reject) => {
        let socket: tls.TLSSocket | net.Socket;
        const timer = setTimeout(() => {
          socket?.destroy();
          reject(new Error('Probe timed out'));
        }, timeout);

        if (url.protocol === 'https:') {
          socket = tls.connect(port, url.hostname, {
            rejectUnauthorized: true,
          });
          socket.once('error', (err) => {
            clearTimeout(timer);
            socket.destroy();
            reject(err);
          });
          socket.once('secureConnect', () => {
            clearTimeout(timer);
            socket.destroy();
            resolve();
          });
        } else {
          socket = net.createConnection(port, url.hostname, () => {
            clearTimeout(timer);
            socket.destroy();
            resolve();
          });
          socket.once('error', (err) => {
            clearTimeout(timer);
            socket.destroy();
            reject(err);
          });
        }
      });
      this.probeResults.set(probeKey, true);
      return true;
    } catch {
      this.probeResults.set(probeKey, false);
      return false;
    }
  }

  /**
   * Return the last known probe result for a target.
   *
   * @param target - The target URL to check.
   * @returns The last probe result, or `undefined` if not yet probed.
   */
  getProbeResult(target: string): boolean | undefined {
    return this.probeResults.get(AgentCache.probeKeyFor(target));
  }

  dispose(): void {
    for (const [, agent] of this.cache) {
      agent.destroy();
    }
    this.cache.clear();
    this.probeResults.clear();
  }
}

/** Create an AgentCache instance for managing HTTP agent pools. */
export function createAgentCache(): AgentCache {
  return new AgentCache();
}

/**
 * Headers that cannot be modified by proxy transformations.
 * These are set by the HTTP stack or upstream and must be preserved as-is.
 */
const READONLY_HEADERS: Set<string> = new Set([
  'host',
  'connection',
  'content-length',
  'transfer-encoding',
]);

/**
 * Default headers allowed to be forwarded to upstream when forwardHeaders is not specified.
 * Omits sensitive headers (authorization, cookie) and x-forwarded-for (requires trustedProxies).
 */
const DEFAULT_FORWARD_HEADERS: string[] = [
  'accept',
  'accept-encoding',
  'accept-language',
  'cache-control',
  'content-type',
  'origin',
  'user-agent',
];

/** Headers that can have multiple values and need special handling. */
const ARRAY_HEADERS: Set<string> = new Set(['set-cookie']);

/**
 * Append the first IP from x-forwarded-for when the sender is a trusted proxy.
 * Only forwards when x-forwarded-for is in the allowlist, trustedProxies is configured,
 * and the socket IP matches a trusted proxy.
 */
function appendForwardedFor(
  headers: Record<string, string>,
  forwardHeaders: string[],
  trustedProxies: string[] | undefined,
  socketIp: string | undefined,
  originalHeaders: Record<string, string | undefined>,
): void {
  if (
    forwardHeaders.includes('x-forwarded-for') &&
    trustedProxies &&
    socketIp &&
    isTrustedProxy(socketIp, trustedProxies)
  ) {
    const forwarded = originalHeaders['x-forwarded-for'];
    if (forwarded) {
      const first = forwarded.split(',')[0];
      if (first) {
        headers['x-forwarded-for'] = first.trim();
      }
    }
  }
}

/**
 * Serialize a query parameter value to string or string array, JSON-encoding non-string values.
 * Arrays are mapped: string items pass through, non-string items are JSON-stringified.
 * @param v - The query parameter value to serialize.
 * @returns The serialized value as a string or string array.
 */
export function serializeQueryParam(v: unknown): string | string[] {
  if (Array.isArray(v)) {
    return v.map((item) => (typeof item === 'string' ? item : JSON.stringify(item)));
  }
  return typeof v === 'string' ? v : JSON.stringify(v);
}

/**
 * Build a {@link RequestContext} from a Hono context object.
 * @param c - The Hono request context.
 * @param body - Optional pre-parsed request body to include.
 * @returns A normalized RequestContext object.
 */
export function buildRequestContextFromHono(c: Context, body?: unknown): RequestContext {
  return {
    body,
    headers: c.req.header() as Record<string, string | string[]>,
    method: c.req.method.toLowerCase() as RequestContext['method'],
    params: Object.fromEntries(
      Object.entries(c.req.param()).filter(([_, v]) => v !== undefined),
    ) as Record<string, string>,
    path: c.req.path,
    query: Object.fromEntries(
      Object.entries(c.req.query()).map(([k, v]) => [k, serializeQueryParam(v)]),
    ),
  };
}

/**
 * Normalize header values to strings, joining arrays with ', ' and tracking
 * which keys had array values for multi-value handling.
 * @param headers - The raw headers with potentially non-string values.
 * @returns Normalized headers and a set of keys that originally had array values.
 */
function normalizeHeaders(headers: Record<string, unknown>): {
  headers: Record<string, string>;
  multiValueKeys: Set<string>;
} {
  const normalized: Record<string, string> = {};
  const multiValueKeys = new Set<string>();
  for (const [key, value] of Object.entries(headers)) {
    if (value !== undefined) {
      if (Array.isArray(value)) {
        multiValueKeys.add(key.toLowerCase());
        normalized[key] = value
          .map((item) => (typeof item === 'string' ? item : JSON.stringify(item)))
          .join(', ');
      } else {
        normalized[key] = typeof value === 'string' ? value : JSON.stringify(value);
      }
    }
  }
  return { headers: normalized, multiValueKeys };
}

/**
 * Filter request headers through the forwardHeaders allowlist, applying
 * x-forwarded-for logic when the sender is a trusted proxy.
 *
 * When `forwardHeaders` is undefined, uses the default allowlist.
 * When `forwardHeaders` is an empty array, forwards no headers.
 * @param headers - The original request headers.
 * @param forwardHeaders - Allowlist of headers to forward. Undefined uses defaults.
 * @param trustedProxies - Trusted proxy IPs/CIDRs for x-forwarded-for validation.
 * @param socketIp - The socket IP of the immediate sender.
 * @returns The filtered headers ready for upstream forwarding.
 */
function filterForwardHeaders(
  headers: Record<string, string | undefined>,
  forwardHeaders?: string[],
  trustedProxies?: string[],
  socketIp?: string,
): Record<string, string> {
  if (forwardHeaders === undefined) {
    const allowed = new Set(DEFAULT_FORWARD_HEADERS.map((h) => h.toLowerCase()));
    const filtered: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
      if (value !== undefined && allowed.has(key.toLowerCase())) {
        filtered[key] = value;
      }
    }
    appendForwardedFor(filtered, DEFAULT_FORWARD_HEADERS, trustedProxies, socketIp, headers);
    return filtered;
  }

  if (forwardHeaders.length === 0) {
    return {};
  }

  const allowed = new Set(forwardHeaders.map((h) => h.toLowerCase()));
  const filtered: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value !== undefined && allowed.has(key.toLowerCase())) {
      filtered[key] = value;
    }
  }
  appendForwardedFor(filtered, forwardHeaders, trustedProxies, socketIp, headers);
  return filtered;
}

/**
 * Apply identity headers from JWT claims to upstream request headers,
 * respecting readonly header constraints and multi-value header rules.
 *
 * Calls `route.identity(ctx, app)` to get a map of header names to values,
 * then sets each header only if it is writable (not readonly, not multi-value).
 */
function applyIdentityHeaders<TApp extends AnyHalideContext>(
  headers: Record<string, string | undefined>,
  route: ProxyRoute<TApp>,
  app: TApp,
  c: Context,
  reqCtx: RequestContext,
): void {
  const claims = app.claims;
  if (!route.identity || !claims) return;
  const identityHeaders = route.identity(reqCtx, app);
  if (!identityHeaders) return;
  const { multiValueKeys } = normalizeHeaders(c.req.header());
  for (const [key, value] of Object.entries(identityHeaders)) {
    if (value !== undefined && isWritableHeader(key, multiValueKeys)) {
      headers[key.toLowerCase()] = value;
    }
  }
}

/**
 * Check if a header is writable: not readonly, not multi-value from the original
 * request, and not in the ARRAY_HEADERS set.
 * @param key - The header name to check.
 * @param multiValueKeys - Set of header keys that had array values in the original request.
 * @returns True if the header can be safely set/modified.
 */
function isWritableHeader(key: string, multiValueKeys: Set<string>): boolean {
  const lowerKey = key.toLowerCase();
  return (
    !READONLY_HEADERS.has(lowerKey) && !ARRAY_HEADERS.has(lowerKey) && !multiValueKeys.has(lowerKey)
  );
}

/**
 * Apply the route's transform function to the request body, logging errors on failure.
 *
 * When no transform is configured, returns the original request body.
 * When a transform exists, normalizes headers, calls the transform function,
 * and applies any modified headers back, respecting readonly constraints.
 */
function applyTransform<TApp extends AnyHalideContext>(
  route: ProxyRoute<TApp>,
  parsedBody: unknown,
  c: Context,
  headers: Record<string, string | undefined>,
  logger?: Logger<unknown>,
): BodyInit | null {
  if (!route.transform) return c.req.raw.body;
  try {
    const jsonBody = parsedBody ?? {};
    const { headers: normalizedHeaders, multiValueKeys } = normalizeHeaders(c.req.header());
    const transformed = route.transform({
      body: jsonBody,
      headers: normalizedHeaders,
      method: c.req.method.toLowerCase() as
        | 'get'
        | 'post'
        | 'put'
        | 'patch'
        | 'delete'
        | 'head'
        | 'options',
    });
    const body = JSON.stringify(transformed.body);
    for (const [key, value] of Object.entries(transformed.headers)) {
      if (isWritableHeader(key, multiValueKeys)) {
        headers[key.toLowerCase()] = value;
      }
    }
    return body;
  } catch (err) {
    logger?.error({}, err instanceof Error ? err.message : String(err));
    throw err;
  }
}

/**
 * Create a proxy handler function that forwards requests to an upstream target.
 *
 * Rewrites paths (supporting wildcard patterns), applies identity headers,
 * transforms the request body, and forwards using `hono/proxy`.
 *
 * @typeParam TApp - The bundled app context type combining claims and logger.
 * @param route - The proxy route configuration.
 * @param app - Bundled app context with claims and logger.
 * @param parsedBody - Optional pre-parsed request body.
 * @returns A function that handles the proxy request.
 */
export function createProxyService<TApp extends AnyHalideContext = HalideContext>(
  route: ProxyRoute<TApp>,
  app: TApp,
  agentCache: AgentCache,
  parsedBody?: unknown,
): (c: Context) => Promise<Response> {
  const logger = app.logger;
  const target = route.target;
  const routePath = route.path;
  const rewritePath = route.proxyPath ?? routePath;
  const timeoutMs = route.timeout ?? DEFAULTS.proxy.timeoutMs;

  if (!target || target === '') {
    throw new Error(`Proxy route "${routePath}" requires a non-empty target URL`);
  }
  let parsedTarget: URL;
  try {
    parsedTarget = new URL(target);
    if (!['http:', 'https:'].includes(parsedTarget.protocol)) {
      throw new Error(
        `Proxy route "${routePath}" target must use http: or https: protocol, got "${parsedTarget.protocol}"`,
      );
    }
  } catch (err) {
    const msg =
      err instanceof Error && err.message.startsWith('Proxy route')
        ? err.message
        : `Proxy route "${routePath}" has an invalid target URL: "${target}"`;
    throw new Error(msg);
  }

  return async (c: Context): Promise<Response> => {
    const isWildcard = routePath.endsWith('/*');
    const prefix = isWildcard ? routePath.slice(0, -2) : routePath;
    const rewritePrefix =
      isWildcard && rewritePath.endsWith('/*')
        ? rewritePath.slice(0, -2)
        : rewritePath.replace(/\/+$/, '');

    let rewrittenPath: string;
    if (isWildcard) {
      const suffix = c.req.path.startsWith(prefix) ? c.req.path.slice(prefix.length) : '';
      rewrittenPath = rewritePrefix + suffix;
    } else {
      const params = c.req.param();
      rewrittenPath = rewritePath;
      for (const [key, value] of Object.entries(params)) {
        rewrittenPath = rewrittenPath.replace(`:${key}`, value);
      }
    }
    const targetUrl = new URL(rewrittenPath, parsedTarget).toString();

    const allHeaders: Record<string, string | undefined> = { ...c.req.header() };
    delete allHeaders['host'];
    delete allHeaders['Host'];

    const nodeReq = c.req as { socket?: { remoteAddress?: string } };
    const socketIp = nodeReq.socket?.remoteAddress;
    const filteredHeaders = filterForwardHeaders(
      allHeaders,
      route.forwardHeaders,
      route.trustedProxies,
      socketIp,
    );
    const headers: Record<string, string | undefined> = { ...filteredHeaders };
    headers['x-forwarded-host'] = c.req.header('host') ?? '';

    applyIdentityHeaders(headers, route, app, c, c.get('reqCtx') as RequestContext);

    const body = applyTransform(route, parsedBody, c, headers, logger);

    const agent = route.agent ?? agentCache.getAgent(target);
    const proxyRequest = new Request(targetUrl, {
      agent,
      body,
      duplex: 'half',
      headers: headers as Record<string, string>,
      method: c.req.method,
    } as RequestInit & { agent?: http.Agent });

    return new Promise<Response>((resolve, reject) => {
      const ac = new AbortController();
      const id = setTimeout(() => {
        ac.abort();
        reject(new DOMException(`Upstream request timed out after ${timeoutMs}ms`, 'TimeoutError'));
      }, timeoutMs);
      proxy(proxyRequest, { signal: ac.signal })
        .then(resolve)
        .catch((err) => {
          if (err.name !== 'AbortError') reject(err);
        })
        .finally(() => clearTimeout(id));
    });
  };
}
