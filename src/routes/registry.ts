import type { Express, RequestHandler, Router } from 'express';
import type { ServerConfig } from '../config/types';
import { createAuthMiddleware, createJwksAuthMiddleware } from '../middleware/auth';
import { createProxyService } from '../services/proxy';

export function registerProxyRoutes<TClaims = unknown>(
  app: Express | Router,
  config: ServerConfig
): void {
  const { proxy } = config;
  if (!proxy) return;

  const jwksUri = config.auth.jwksUri;
  const secret = config.auth.secret;

  const authMiddleware =
    config.auth.strategy === 'jwks' && jwksUri
      ? createJwksAuthMiddleware<TClaims>(jwksUri)
      : createAuthMiddleware<TClaims>(new TextEncoder().encode(secret));

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
  config: ServerConfig
): void {
  const { api } = config;
  if (!api) return;

  const jwksUri = config.auth.jwksUri;
  const secret = config.auth.secret;

  const authMiddleware =
    config.auth.strategy === 'jwks' && jwksUri
      ? createJwksAuthMiddleware<TClaims>(jwksUri)
      : createAuthMiddleware<TClaims>(new TextEncoder().encode(secret));

  for (const route of api.routes) {
    const fullPath = `${api.basePath}${route.path}`;
    const method = route.method ?? 'get';
    const router = app as Router;
    if (route.access === 'public') {
      router[method](fullPath, route.handler as RequestHandler);
    } else {
      router[method](fullPath, authMiddleware, route.handler as RequestHandler);
    }
  }
}
