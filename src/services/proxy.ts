import type { Context } from 'hono';
import { proxy } from 'hono/proxy';
import { DEFAULTS } from '../config/defaults';
import type { Logger, ProxyRoute, RequestContext } from '../config/types';

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
    const rewrittenPath = c.req.path.replace(new RegExp(`^${routePath}`), rewritePath);
    const targetUrl = new URL(rewrittenPath + c.req.url.replace(c.req.path, ''), target).toString();

    const headers: Record<string, string | undefined> = { ...c.req.header() };

    if (route.identity && claims) {
      const ctx = buildRequestContextFromHono(c, parsedBody);
      const identityHeaders = route.identity(ctx, claims);
      if (identityHeaders) {
        for (const [key, value] of Object.entries(identityHeaders)) {
          if (value !== undefined) {
            headers[key] = value;
          }
        }
      }
    }

    let body: BodyInit | null = c.req.raw.body;
    if (route.transform) {
      try {
        const jsonBody = parsedBody ?? {};
        const { headers: normalizedHeaders, multiValueKeys } = normalizeHeaders(c.req.header());
        const transformed = route.transform({ body: jsonBody, headers: normalizedHeaders });
        body = JSON.stringify(transformed.body);
        for (const [key, value] of Object.entries(transformed.headers)) {
          const lowerKey = key.toLowerCase();
          if (READONLY_HEADERS.has(lowerKey)) continue;
          if (ARRAY_HEADERS.has(lowerKey)) continue;
          if (multiValueKeys.has(lowerKey)) continue;
          headers[lowerKey] = value;
        }
      } catch (err) {
        logger?.error('[halide] Transform error:', err);
        throw err;
      }
    }

    const signal = AbortSignal.timeout(timeoutMs);

    const proxyRequest = new Request(targetUrl, {
      body: route.transform ? body : c.req.raw.body,
      // @ts-expect-error - duplex is needed for streaming request bodies
      duplex: 'half',
      headers: headers as Record<string, string>,
      method: c.req.method,
      signal,
    });

    return proxy(proxyRequest);
  };
}
