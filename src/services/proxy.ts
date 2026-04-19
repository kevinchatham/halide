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
        if (identity && expressReq.claims) {
          const ctx: RequestContext = {
            body: expressReq.body,
            headers: expressReq.headers as Record<string, string | string[]>,
            method: expressReq.method.toLowerCase() as RequestContext['method'],
            params: Object.fromEntries(
              Object.entries(expressReq.params || {}).map(([k, v]) => [k, String(v)]),
            ),
            path: expressReq.path,
            query: Object.fromEntries(
              Object.entries(expressReq.query || {}).map(([k, v]) => [
                k,
                Array.isArray(v) ? v.map(String) : String(v),
              ]),
            ),
          };
          const headers = identity(ctx, expressReq.claims as TClaims);
          if (headers) {
            for (const [key, value] of Object.entries(headers)) {
              if (value !== undefined) {
                proxyReq.setHeader(key, value);
              }
            }
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
      const multiValueKeys = new Set<string>();
      const headers: Record<string, string> = {};
      for (const [key, value] of Object.entries(req.headers)) {
        if (value !== undefined) {
          if (Array.isArray(value)) {
            multiValueKeys.add(key.toLowerCase());
            headers[key] = value.join(', ');
          } else {
            headers[key] = String(value);
          }
        }
      }
      const transformed = transform({ body, headers });

      req.body = transformed.body;
      for (const [key, value] of Object.entries(transformed.headers)) {
        const lowerKey = key.toLowerCase();
        if (READONLY_HEADERS.has(lowerKey)) continue;
        if (ARRAY_HEADERS.has(lowerKey)) continue;
        if (multiValueKeys.has(lowerKey)) continue;
        req.headers[lowerKey] = value;
      }
    } catch (err) {
      logger?.error('[halide] Transform error:', err);
      next(err);
      return;
    }
    proxy(req, res, next);
  };
}
