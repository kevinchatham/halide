import type { Context } from 'hono';
import { proxy } from 'hono/proxy';
import { DEFAULTS } from '../config/defaults';
import type { Logger, ProxyRoute, RequestContext } from '../types';

const READONLY_HEADERS: Set<string> = new Set([
  'host',
  'connection',
  'content-length',
  'transfer-encoding',
]);

const ARRAY_HEADERS: Set<string> = new Set(['set-cookie']);

export function serializeQueryParam(v: unknown): string | string[] {
  if (Array.isArray(v)) {
    return v.map((item) => (typeof item === 'string' ? item : JSON.stringify(item)));
  }
  return typeof v === 'string' ? v : JSON.stringify(v);
}

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

function applyIdentityHeaders<TClaims>(
  headers: Record<string, string | undefined>,
  route: ProxyRoute<TClaims>,
  claims: TClaims | undefined,
  c: Context,
  parsedBody: unknown,
): void {
  if (!route.identity || !claims) return;
  const ctx = buildRequestContextFromHono(c, parsedBody);
  const identityHeaders = route.identity(ctx, claims);
  if (!identityHeaders) return;
  for (const [key, value] of Object.entries(identityHeaders)) {
    if (value !== undefined) {
      headers[key] = value;
    }
  }
}

function isWritableHeader(key: string, multiValueKeys: Set<string>): boolean {
  const lowerKey = key.toLowerCase();
  return (
    !READONLY_HEADERS.has(lowerKey) && !ARRAY_HEADERS.has(lowerKey) && !multiValueKeys.has(lowerKey)
  );
}

function applyTransform<TClaims>(
  route: ProxyRoute<TClaims>,
  parsedBody: unknown,
  c: Context,
  headers: Record<string, string | undefined>,
  logger?: Logger,
): BodyInit | null {
  if (!route.transform) return c.req.raw.body;
  try {
    const jsonBody = parsedBody ?? {};
    const { headers: normalizedHeaders, multiValueKeys } = normalizeHeaders(c.req.header());
    const transformed = route.transform({ body: jsonBody, headers: normalizedHeaders });
    const body = JSON.stringify(transformed.body);
    for (const [key, value] of Object.entries(transformed.headers)) {
      if (isWritableHeader(key, multiValueKeys)) {
        headers[key.toLowerCase()] = value;
      }
    }
    return body;
  } catch (err) {
    logger?.error('[halide] Transform error:', err);
    throw err;
  }
}

export function createProxyService<TClaims = unknown>(
  route: ProxyRoute<TClaims>,
  claims: TClaims | undefined,
  logger?: Logger,
  parsedBody?: unknown,
): (c: Context) => Promise<Response> {
  const target = route.target;
  const routePath = route.path;
  const rewritePath = route.proxyPath ?? routePath;
  const timeoutMs = route.timeout ?? DEFAULTS.proxy.timeoutMs;

  return async (c: Context): Promise<Response> => {
    const isWildcard = routePath.endsWith('/*');
    const prefix = isWildcard ? routePath.slice(0, -2) : routePath;
    const rewritePrefix =
      isWildcard && rewritePath.endsWith('/*') ? rewritePath.slice(0, -2) : rewritePath;

    let rewrittenPath: string;
    if (isWildcard) {
      const suffix = c.req.path.startsWith(prefix) ? c.req.path.slice(prefix.length) : '';
      rewrittenPath = rewritePrefix + suffix;
    } else {
      rewrittenPath = c.req.path.replace(new RegExp(`^${routePath}`), rewritePath);
    }
    const targetUrl = new URL(rewrittenPath + c.req.url.replace(c.req.path, ''), target).toString();

    const headers: Record<string, string | undefined> = { ...c.req.header() };
    delete headers['host'];
    delete headers['Host'];
    headers['x-forwarded-host'] = c.req.header('host') ?? '';

    applyIdentityHeaders(headers, route, claims, c, parsedBody);

    const body = applyTransform(route, parsedBody, c, headers, logger);

    const signal = AbortSignal.timeout(timeoutMs);

    const proxyRequest = new Request(targetUrl, {
      body,
      // @ts-expect-error - duplex is needed for streaming request bodies
      duplex: 'half',
      headers: headers as Record<string, string>,
      method: c.req.method,
      signal,
    });

    return proxy(proxyRequest);
  };
}
