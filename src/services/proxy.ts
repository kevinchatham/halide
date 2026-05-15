import http from 'node:http';
import net from 'node:net';
import tls from 'node:tls';
import type { Context } from 'hono';
import { proxy } from 'hono/proxy';
import { MAX_AGENT_CACHE } from '../config/constants';
import { DEFAULTS } from '../config/defaults';
import type { HalideContext, ProxyRoute } from '../types/api';
import type { Logger, RequestContext } from '../types/app';
import { isTrustedProxy } from '../utils/trustedProxies';

/** Cached HTTP agent pool with bounded size. */
export class AgentCache {
  private readonly cache = new Map<string, http.Agent>();
  private probeResults = new Map<string, boolean>();

  getAgent(target: string, maxSockets?: number, maxFreeSockets?: number): http.Agent {
    const key = `${target}|${maxSockets ?? 50}|${maxFreeSockets ?? 10}`;
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
        maxFreeSockets: maxFreeSockets ?? 10,
        maxSockets: maxSockets ?? 50,
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

/** Create an AgentCache instance. */
export function createAgentCache(): AgentCache {
  return new AgentCache();
}

/** Headers that cannot be modified by proxy transformations. */
const READONLY_HEADERS: Set<string> = new Set([
  'host',
  'connection',
  'content-length',
  'transfer-encoding',
]);

/** Default headers allowed to be forwarded to upstream when forwardHeaders is not specified. */
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

/** Extract the first IP from an x-forwarded-for header when the sender is a trusted proxy. */
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

/** Serialize a query parameter value to string or string array, JSON-encoding non-string values. */
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

/** Normalize headers to string values, joining array values with ', '. Tracks which keys had multiple values. */
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

/** Filter headers through the forwardHeaders allowlist, returning only allowed headers. Uses a default allowlist when forwardHeaders is undefined. */
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

/** Apply identity headers from JWT claims to the upstream request headers map, respecting readonly and multi-value constraints. */
function applyIdentityHeaders<TApp extends HalideContext>(
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

/** Check if a header name is writable — not readonly, not in ARRAY_HEADERS, and not already multi-valued. */
function isWritableHeader(key: string, multiValueKeys: Set<string>): boolean {
  const lowerKey = key.toLowerCase();
  return (
    !READONLY_HEADERS.has(lowerKey) && !ARRAY_HEADERS.has(lowerKey) && !multiValueKeys.has(lowerKey)
  );
}

/** Apply a configured body transformation, returning the transformed body or original request body, logging errors on failure. */
function applyTransform<TApp extends HalideContext>(
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
export function createProxyService<TApp extends HalideContext = HalideContext>(
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

    const signal = AbortSignal.timeout(timeoutMs);

    const agent =
      route.agent ??
      agentCache.getAgent(target, route.connection?.maxSockets, route.connection?.maxFreeSockets);
    const proxyRequest = new Request(targetUrl, {
      agent,
      body,
      duplex: 'half',
      headers: headers as Record<string, string>,
      method: c.req.method,
      signal,
    } as RequestInit & { agent?: http.Agent });

    const proxyPromise = proxy(proxyRequest);
    const timeoutPromise = new Promise<never>((_, reject) => {
      signal.addEventListener(
        'abort',
        () => {
          reject(
            new DOMException(`Upstream request timed out after ${timeoutMs}ms`, 'TimeoutError'),
          );
        },
        { once: true },
      );
    });
    return Promise.race([proxyPromise, timeoutPromise]);
  };
}
