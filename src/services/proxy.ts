import http from 'node:http';
import type { Context } from 'hono';
import { proxy } from 'hono/proxy';
import { DEFAULTS } from '../config/defaults';
import type { ProxyRoute } from '../types/api';
import type { Logger, RequestContext, THalideApp } from '../types/app';

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
  'content-length',
  'origin',
  'user-agent',
];

/** Headers that can have multiple values and need special handling. */
const ARRAY_HEADERS: Set<string> = new Set(['set-cookie']);

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
    params: Object.fromEntries(Object.entries(c.req.param()).map(([k, v]) => [k, v ?? ''])),
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
): Record<string, string> {
  if (forwardHeaders === undefined) {
    // Default allowlist
    const allowed = new Set(DEFAULT_FORWARD_HEADERS.map((h) => h.toLowerCase()));
    const filtered: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
      if (value !== undefined && allowed.has(key.toLowerCase())) {
        filtered[key] = value;
      }
    }
    return filtered;
  }

  if (forwardHeaders.length === 0) {
    // Explicit empty array — forward no headers
    return {};
  }

  const allowed = new Set(forwardHeaders.map((h) => h.toLowerCase()));
  const filtered: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value !== undefined && allowed.has(key.toLowerCase())) {
      filtered[key] = value;
    }
  }
  return filtered;
}

/** Apply identity headers from JWT claims to the upstream request headers map, respecting readonly and multi-value constraints. */
function applyIdentityHeaders<TApp>(
  headers: Record<string, string | undefined>,
  route: ProxyRoute<TApp>,
  app: TApp,
  c: Context,
  parsedBody: unknown,
): void {
  const claims = (app as THalideApp).claims;
  if (!route.identity || !claims) return;
  const ctx = buildRequestContextFromHono(c, parsedBody);
  const identityHeaders = route.identity(ctx, app);
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
function applyTransform<TApp>(
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
    logger?.error({} as unknown, err instanceof Error ? err.message : String(err));
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
export function createProxyService<TApp = unknown>(
  route: ProxyRoute<TApp>,
  app: TApp,
  parsedBody?: unknown,
): (c: Context) => Promise<Response> {
  const logger = (app as THalideApp).logger;
  const target = route.target;
  const routePath = route.path;
  const rewritePath = route.proxyPath ?? routePath;
  const timeoutMs = route.timeout ?? DEFAULTS.proxy.timeoutMs;

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
      rewrittenPath = c.req.path.replace(new RegExp(`^${routePath}`), rewritePath);
    }
    const targetUrl = new URL(rewrittenPath, target).toString();

    const allHeaders: Record<string, string | undefined> = { ...c.req.header() };
    delete allHeaders['host'];
    delete allHeaders['Host'];

    const filteredHeaders = filterForwardHeaders(allHeaders, route.forwardHeaders);
    const headers: Record<string, string | undefined> = { ...filteredHeaders };
    headers['x-forwarded-host'] = c.req.header('host') ?? '';

    applyIdentityHeaders(headers, route, app, c, parsedBody);

    const body = applyTransform(route, parsedBody, c, headers, logger);

    const signal = AbortSignal.timeout(timeoutMs);

    const agent = route.agent ?? new http.Agent({ keepAlive: true });
    const proxyRequest = new Request(targetUrl, {
      agent,
      body,
      duplex: 'half',
      headers: headers as Record<string, string>,
      method: c.req.method,
      signal,
    } as RequestInit & { agent?: http.Agent });

    return proxy(proxyRequest);
  };
}
