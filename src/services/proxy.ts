import type { RequestHandler } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import type { RequestContext, TransformFn } from '../config/types';

export function createProxyService<TClaims = unknown>(
  target: string,
  routePath: string,
  proxyPath: string | undefined,
  identity?: (ctx: RequestContext, claims: TClaims) => Record<string, string> | undefined,
  transform?: TransformFn
): RequestHandler {
  const rewritePath = proxyPath ?? routePath;
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    pathRewrite: {
      [`^${routePath}`]: rewritePath,
    },
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
        ? (proxyRes, req) => {
            const chunks: Buffer[] = [];
            proxyRes.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
            proxyRes.on('end', async () => {
              const body = Buffer.concat(chunks).toString();
              const ctx: RequestContext = {
                method: req.method.toLowerCase() as RequestContext['method'],
                path: req.path,
                headers: req.headers as Record<string, string>,
                params: (req as any).params || {},
                query: (req as any).query || {},
                body: (req as any).body,
              };
              try {
                const parsed = JSON.parse(body);
                const transformed = transform(parsed);
                (proxyRes as any).transformedBody = JSON.stringify(transformed);
                (proxyRes as any).transformed = true;
              } catch {
                (proxyRes as any).transformedBody = body;
                (proxyRes as any).transformed = false;
              }
            });
          }
        : undefined,
    },
  });
}
