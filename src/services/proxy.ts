import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { DEFAULTS } from '../config/defaults';
import type { Logger, RequestContext, TransformFn } from '../config/types';

// READONLY_HEADERS and ARRAY_HEADERS follow Node's http.IncomingMessage.headers convention
// (also used by Express's req.headers): all keys are lowercase, multi-value headers like
// set-cookie are stored as arrays, and certain hop-by-hop/protocol headers must not be
// overwritten. Transform output keys are normalized to lowercase before writing back to
// req.headers to maintain consistency with this convention.
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

export function buildRequestContextFromExpress(req: Request): RequestContext {
  return {
    body: req.body,
    headers: req.headers as Record<string, string | string[]>,
    method: req.method.toLowerCase() as RequestContext['method'],
    params: Object.fromEntries(
      Object.entries(req.params || {}).map(([k, v]) => [
        k,
        typeof v === 'string' ? v : JSON.stringify(v),
      ]),
    ),
    path: req.path,
    query: Object.fromEntries(
      Object.entries(req.query || {}).map(([k, v]) => [k, serializeQueryParam(v)]),
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

function applyTransformedHeaders(
  req: Request,
  transformedHeaders: Record<string, string>,
  multiValueKeys: Set<string>,
): void {
  for (const [key, value] of Object.entries(transformedHeaders)) {
    const lowerKey = key.toLowerCase();
    if (READONLY_HEADERS.has(lowerKey)) continue;
    if (ARRAY_HEADERS.has(lowerKey)) continue;
    if (multiValueKeys.has(lowerKey)) continue;
    req.headers[lowerKey] = value;
  }
}

export function createProxyService<TClaims = unknown>(
  target: string,
  routePath: string,
  proxyPath: string | undefined,
  identity?: (ctx: RequestContext, claims: TClaims) => Record<string, string> | undefined,
  transform?: TransformFn,
  timeout?: number,
  logger?: Logger,
): RequestHandler {
  const rewritePath = proxyPath ?? routePath;
  const proxy = createProxyMiddleware({
    changeOrigin: true,
    on: {
      proxyReq: (
        proxyReq: import('node:http').ClientRequest,
        req: import('node:http').IncomingMessage,
      ) => {
        const expressReq = req as Request;
        if (!identity || !expressReq.claims) return;

        const ctx = buildRequestContextFromExpress(expressReq);
        const headers = identity(ctx, expressReq.claims as TClaims);
        if (!headers) return;

        for (const [key, value] of Object.entries(headers)) {
          if (value !== undefined) {
            proxyReq.setHeader(key, value);
          }
        }
      },
    },
    pathRewrite: {
      [`^${routePath}`]: rewritePath,
    },
    target,
    timeout: timeout ?? DEFAULTS.proxy.timeoutMs,
  });

  if (!transform) {
    return proxy;
  }

  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = typeof req.body === 'object' && req.body ? req.body : {};
      const { headers, multiValueKeys } = normalizeHeaders(req.headers);
      const transformed = transform({ body, headers });

      req.body = transformed.body;
      applyTransformedHeaders(req, transformed.headers, multiValueKeys);
    } catch (err) {
      logger?.error('[halide] Transform error:', err);
      next(err);
      return;
    }
    proxy(req, res, next);
  };
}
