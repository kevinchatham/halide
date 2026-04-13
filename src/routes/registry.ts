import type { Express } from 'express';
import type { ServerConfig } from '../config/types';
import { createAuthMiddleware } from '../middleware/auth';
import { createProxyService } from '../services/proxy';
import { createSpaHandler } from './spa';

export function registerRoutes<TClaims = unknown>(app: Express, config: ServerConfig): void {
  registerProxyRoutes<TClaims>(app, config);
  registerApiRoutes<TClaims>(app, config);

  const spaHandler = createSpaHandler(config.app.spa);
  app.get(/^\/(.*)/, spaHandler);
}

export function registerProxyRoutes<TClaims = unknown>(app: Express, config: ServerConfig): void {
  const { proxy } = config;
  const secret = new TextEncoder().encode(config.auth.secret);
  const authMiddleware = createAuthMiddleware<TClaims>(secret);

  for (const route of proxy.routes) {
    const fullPath = `${proxy.basePath}${route.path}`;
    if (route.access === 'public') {
      const proxyHandler = createProxyService(route.target, route.path);
      app.use(fullPath, proxyHandler);
    } else {
      const proxyHandler = createProxyService(route.target, route.path);
      app.use(fullPath, authMiddleware, proxyHandler);
    }
  }
}

export function registerApiRoutes<TClaims = unknown>(app: Express, config: ServerConfig): void {
  const { api } = config;
  const secret = new TextEncoder().encode(config.auth.secret);
  const authMiddleware = createAuthMiddleware<TClaims>(secret);

  for (const route of api.routes) {
    const fullPath = `${api.basePath}${route.path}`;
    if (route.access === 'public') {
      app.get(fullPath, route.handler);
    } else {
      app.get(fullPath, authMiddleware, route.handler);
    }
  }
}
