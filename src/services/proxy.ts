import type { RequestHandler } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';

export function createProxyService(target: string, routePath: string): RequestHandler {
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    pathRewrite: {
      [`^${routePath}`]: '',
    },
  });
}
