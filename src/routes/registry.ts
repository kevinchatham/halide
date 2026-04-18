import type { Express, Request, RequestHandler, Router } from 'express';
import type { ApiRoute, ProxyRoute, RequestContext, ServerConfig } from '../config/types';
import { createAuthMiddleware, createJwksAuthMiddleware } from '../middleware/auth';
import { createBodyValidationMiddleware } from '../middleware/validate';
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
  const { apiRoutes, proxyRoutes } = config;
  const router = app as Router;
  const authMiddleware = await createAuthMiddlewareFromConfig<TClaims>(config);

  if (apiRoutes) {
    for (const route of apiRoutes) {
      const fullPath = route.path;
      const method = route.method ?? 'get';
      const middlewares: RequestHandler[] = [];
      if (route.access !== 'public' && authMiddleware) {
        middlewares.push(authMiddleware);
      }
      if (route.authorize) {
        middlewares.push(createAuthorizeMiddleware(route.authorize));
      }
      if (route.validationSchema) {
        middlewares.push(createBodyValidationMiddleware(route.validationSchema));
      }
      const handlerMiddleware: RequestHandler = async (req, res, next) => {
        const ctx = buildRequestContext(req) as RequestContext & { body: unknown };
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
    }
  }

  if (proxyRoutes) {
    for (const route of proxyRoutes) {
      const fullPath = route.path;
      const proxyHandler = createProxyService<TClaims>(
        route.target,
        route.path,
        route.proxyPath,
        route.identity,
        route.transform
      );
      type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';
      const methods = route.methods as HttpMethod[];
      for (const method of methods) {
        const middlewares: RequestHandler[] = [];
        if (route.access !== 'public' && authMiddleware) {
          middlewares.push(authMiddleware);
        }
        if (route.authorize) {
          middlewares.push(createAuthorizeMiddleware(route.authorize));
        }
        middlewares.push(proxyHandler);
        router[method](fullPath, ...middlewares);
      }
    }
  }
}
