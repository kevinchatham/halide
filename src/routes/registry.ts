import type { Express, Request, RequestHandler, Router } from 'express';
import type { RequestContext } from '../config/schema';
import type { ApiRoute, ProxyRoute, ServerConfig } from '../config/types';
import { createAuthMiddleware, createJwksAuthMiddleware } from '../middleware/auth';
import { createProxyService } from '../services/proxy';

async function resolveSecret(
  secret: string | (() => string) | (() => Promise<string>)
): Promise<string> {
  if (typeof secret === 'function') {
    return secret();
  }
  return secret;
}

function getAuthConfig<TClaims = unknown>(config: ServerConfig<TClaims>) {
  return config.security?.auth;
}

async function createAuthMiddlewareFromConfig<TClaims = unknown>(
  config: ServerConfig<TClaims>
): Promise<RequestHandler | undefined> {
  const auth = getAuthConfig(config);
  if (!auth) return undefined;

  const jwksUri = auth.jwksUri;
  const secret = auth.secret;

  if (auth.strategy === 'jwks' && jwksUri) {
    return createJwksAuthMiddleware<TClaims>(jwksUri);
  }

  if (secret !== undefined) {
    const resolvedSecret = await resolveSecret(
      secret as string | (() => string) | (() => Promise<string>)
    );
    return createAuthMiddleware<TClaims>(new TextEncoder().encode(resolvedSecret));
  }

  return undefined;
}

function buildRequestContext(req: Request): RequestContext {
  return {
    method: req.method.toLowerCase() as RequestContext['method'],
    path: req.path,
    headers: req.headers as Record<string, string | string[]>,
    params: Object.fromEntries(Object.entries(req.params || {}).map(([k, v]) => [k, String(v)])),
    query: Object.fromEntries(
      Object.entries(req.query || {}).map(([k, v]) => [
        k,
        Array.isArray(v) ? v.map(String) : String(v),
      ])
    ),
    body: req.body,
  };
}

function createAuthorizeMiddleware<TClaims = unknown>(
  authorizeFn: NonNullable<ApiRoute<TClaims>['authorize'] | ProxyRoute<TClaims>['authorize']>
): RequestHandler {
  return async (req, res, next) => {
    const ctx = buildRequestContext(req);
    const claims = req.claims as TClaims | undefined;
    try {
      const allowed = await authorizeFn(ctx, claims);
      if (!allowed) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
      next();
    } catch {
      res.status(403).json({ error: 'Forbidden' });
    }
  };
}

export async function registerRoutes<TClaims = unknown>(
  app: Express | Router,
  config: ServerConfig<TClaims>
): Promise<void> {
  const { routes } = config;
  if (!routes || routes.length === 0) return;

  const authMiddleware = await createAuthMiddlewareFromConfig<TClaims>(config);

  for (const route of routes) {
    const fullPath = route.path;
    const router = app as Router;

    if ('handler' in route && route.handler) {
      const method = route.method ?? 'get';
      const middlewares: RequestHandler[] = [];
      if (route.access !== 'public' && authMiddleware) {
        middlewares.push(authMiddleware);
      }
      if (route.authorize) {
        middlewares.push(createAuthorizeMiddleware(route.authorize));
      }
      const handlerMiddleware: RequestHandler = async (req, res, next) => {
        const ctx = buildRequestContext(req);
        const claims = req.claims as TClaims | undefined;
        try {
          const result = await route.handler(ctx, claims);
          res.json(result);
        } catch (err) {
          next(err);
        }
      };
      middlewares.push(handlerMiddleware);
      router[method](fullPath, ...middlewares);
    } else if ('target' in route && route.target) {
      const proxyRoute = route as ProxyRoute<TClaims>;
      const proxyHandler = createProxyService<TClaims>(
        proxyRoute.target,
        proxyRoute.path,
        proxyRoute.proxyPath,
        proxyRoute.identity,
        proxyRoute.transform
      );
      type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';
      const methods = proxyRoute.methods as HttpMethod[];
      for (const method of methods) {
        const middlewares: RequestHandler[] = [];
        if (route.access !== 'public' && authMiddleware) {
          middlewares.push(authMiddleware);
        }
        if (proxyRoute.authorize) {
          middlewares.push(createAuthorizeMiddleware(proxyRoute.authorize));
        }
        middlewares.push(proxyHandler);
        router[method](fullPath, ...middlewares);
      }
    }
  }
}
