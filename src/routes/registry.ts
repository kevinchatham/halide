import type { Express, RequestHandler, Router } from 'express';
import type { BffConfig } from '../config/types';
import { createAuthMiddleware } from '../middleware/auth';
import { createProxyService } from '../services/proxy';
import { createSpaHandler } from './spa';

export function registerRoutes<TClaims = unknown>(app: Express, config: BffConfig): void {
  registerProxyRoutes<TClaims>(app, config);
  registerApiRoutes<TClaims>(app, config);

  if (config.app.spa) {
    const spaHandler = createSpaHandler(config.app.spa);
    app.get(/^\/(.*)/, spaHandler);
  }
}

export function registerProxyRoutes<TClaims = unknown>(
  app: Express | Router,
  config: BffConfig
): void {
  const { proxy } = config;
  if (!proxy) return;
  const secret = new TextEncoder().encode(config.auth.secret);
  const authMiddleware = createAuthMiddleware<TClaims>(secret);

  for (const route of proxy.routes) {
    const fullPath = `${proxy.basePath}${route.path}`;
    if (route.access === 'public') {
      const proxyHandler = createProxyService(route.target, route.path);
      (app as Router).use(fullPath, proxyHandler);
    } else {
      const proxyHandler = createProxyService(route.target, route.path);
      (app as Router).use(fullPath, authMiddleware, proxyHandler);
    }
  }
}

export function registerApiRoutes<TClaims = unknown>(
  app: Express | Router,
  config: BffConfig
): void {
  const { api } = config;
  if (!api) return;
  const secret = new TextEncoder().encode(config.auth.secret);
  const authMiddleware = createAuthMiddleware<TClaims>(secret);

  for (const route of api.routes) {
    const fullPath = `${api.basePath}${route.path}`;
    if (route.access === 'public') {
      (app as Router).get(fullPath, route.handler as RequestHandler);
    } else {
      (app as Router).get(fullPath, authMiddleware, route.handler as RequestHandler);
    }
  }
}
