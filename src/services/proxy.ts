import type { RequestHandler } from 'express';
import { createProxyMiddleware, responseInterceptor } from 'http-proxy-middleware';
import { DEFAULTS } from '../config/defaults';
import type { RequestContext, TransformFn } from '../config/types';

export function createProxyService<TClaims = unknown>(
  target: string,
  routePath: string,
  proxyPath: string | undefined,
  identity?: (ctx: RequestContext, claims: TClaims) => Record<string, string> | undefined,
  transform?: TransformFn,
  timeout?: number
): RequestHandler {
  const rewritePath = proxyPath ?? routePath;
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    timeout: timeout ?? DEFAULTS.proxy.timeoutMs,
    pathRewrite: {
      [`^${routePath}`]: rewritePath,
    },
    selfHandleResponse: !!transform,
    on: {
      proxyReq: (proxyReq, req) => {
        if (identity && (req as any).claims) {
          const ctx: RequestContext = {
            method: req.method.toLowerCase() as RequestContext['method'],
            path: req.path,
            headers: req.headers as Record<string, string>,
            params: (req.params || {}) as Record<string, string>,
            query: req.query as Record<string, string>,
            body: req.body,
          };
          const headers = identity(ctx, (req as any).claims);
          if (headers) {
            for (const [key, value] of Object.entries(headers)) {
              if (value !== undefined) {
                proxyReq.setHeader(key, value);
              }
            }
          }
        }
      },
      proxyRes: transform
        ? responseInterceptor(async (responseBuffer, proxyRes) => {
            const body = responseBuffer.toString();
            let parsed: unknown;
            try {
              parsed = JSON.parse(body);
            } catch {
              return responseBuffer;
            }
            const headers: Record<string, string> = {};
            const setCookieValues: string[] = [];
            for (const [key, value] of Object.entries(proxyRes.headers)) {
              if (value === undefined) continue;
              if (key.toLowerCase() === 'set-cookie') {
                const values = Array.isArray(value) ? value : [value];
                setCookieValues.push(...values);
                delete proxyRes.headers[key];
              } else {
                headers[key] = Array.isArray(value) ? value.join(', ') : value;
              }
            }
            if (setCookieValues.length > 0) {
              proxyRes.headers['set-cookie'] = setCookieValues;
            }
            try {
              const transformed = await transform({ body: parsed, headers });
              for (const [key, value] of Object.entries(transformed.headers)) {
                if (value !== undefined && value !== null) {
                  proxyRes.headers[key] = value;
                }
              }
              return JSON.stringify(transformed.body);
            } catch (err) {
              console.error('[bspa] Transform error:', err);
              return responseBuffer;
            }
          })
        : undefined,
    },
  });
}
