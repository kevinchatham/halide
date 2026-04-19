import type { Express, NextFunction, Request, RequestHandler, Response, Router } from 'express';
import { DEFAULTS } from '../config/defaults';
import type {
  ApiRoute,
  Logger,
  ObservabilityConfig,
  ProxyRoute,
  RequestContext,
  SecurityAuthConfig,
  ServerConfig,
} from '../config/types';
import { createAuthMiddleware, createJwksAuthMiddleware } from '../middleware/auth';
import { createBodyValidationMiddleware } from '../middleware/validate';
import { buildRequestContextFromExpress, createProxyService } from '../services/proxy';

async function resolveSecret(
  secret: string | (() => string) | (() => Promise<string>),
): Promise<string> {
  if (typeof secret === 'function') {
    return secret();
  }
  return secret;
}

function getAuthConfig<TClaims = unknown>(
  config: ServerConfig<TClaims>,
): SecurityAuthConfig | undefined {
  return config.security?.auth;
}

async function createAuthMiddlewareFromConfig<TClaims = unknown>(
  config: ServerConfig<TClaims>,
): Promise<RequestHandler | undefined> {
  const auth = getAuthConfig(config);
  if (!auth) return undefined;

  const jwksUri = auth.jwksUri;
  const secret = auth.secret;

  if (auth.strategy === 'jwks' && jwksUri) {
    return createJwksAuthMiddleware<TClaims>(jwksUri, auth.audience);
  }

  if (secret !== undefined) {
    const resolvedSecret = await resolveSecret(
      secret as string | (() => string) | (() => Promise<string>),
    );
    return createAuthMiddleware<TClaims>(new TextEncoder().encode(resolvedSecret), auth.audience);
  }

  return undefined;
}

function buildRequestContext(req: Request): RequestContext {
  return buildRequestContextFromExpress(req);
}

function createAuthorizeMiddleware<TClaims = unknown>(
  authorizeFn: NonNullable<ApiRoute<TClaims>['authorize'] | ProxyRoute<TClaims>['authorize']>,
  logger: Logger,
): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const ctx = buildRequestContext(req);
    const claims = req.claims as TClaims | undefined;
    try {
      const allowed = await authorizeFn(ctx, claims, logger);
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

function createObservationMiddleware<TClaims = unknown>(
  observability: ObservabilityConfig<TClaims>,
  routeObserve: boolean | undefined,
  logger: Logger,
): RequestHandler | undefined {
  if (!observability.onRequest && !observability.onResponse) return undefined;
  if (routeObserve === false) return undefined;

  return (req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    const ctx = buildRequestContext(req);
    const claims = req.claims as TClaims | undefined;

    observability.onRequest?.(ctx, claims, logger);

    if (observability.onResponse) {
      res.on('finish', () => {
        observability.onResponse?.(
          ctx,
          claims,
          {
            durationMs: Date.now() - start,
            error: res.locals?.error,
            statusCode: res.statusCode,
          },
          logger,
        );
      });
    }

    next();
  };
}

function buildApiRouteMiddlewares<TClaims = unknown>(
  route: ApiRoute<TClaims>,
  authMiddleware: RequestHandler | undefined,
  observability: ObservabilityConfig<TClaims> | undefined,
  logger: Logger,
): RequestHandler[] {
  const middlewares: RequestHandler[] = [];
  if (route.access !== 'public' && authMiddleware) {
    middlewares.push(authMiddleware);
  }
  if (route.authorize) {
    middlewares.push(createAuthorizeMiddleware(route.authorize, logger));
  }
  if (observability) {
    const routeObs = createObservationMiddleware(observability, route.observe, logger);
    if (routeObs) middlewares.push(routeObs);
  }
  if (route.validationSchema) {
    middlewares.push(createBodyValidationMiddleware(route.validationSchema));
  }
  return middlewares;
}

function createApiHandlerMiddleware<TClaims = unknown>(
  route: ApiRoute<TClaims>,
  logger: Logger,
): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const ctx = buildRequestContext(req) as RequestContext & {
      body: unknown;
    };
    const claims = req.claims as TClaims | undefined;
    try {
      const result = await route.handler(ctx, claims, logger);
      res.json(result);
    } catch (err) {
      next(err);
    }
  };
}

function registerApiRoute<TClaims = unknown>(
  router: Router,
  route: ApiRoute<TClaims>,
  authMiddleware: RequestHandler | undefined,
  observability: ObservabilityConfig<TClaims> | undefined,
  logger: Logger,
): void {
  const fullPath = route.path;
  const method = route.method ?? DEFAULTS.route.method;
  const middlewares = buildApiRouteMiddlewares(route, authMiddleware, observability, logger);
  middlewares.push(createApiHandlerMiddleware(route, logger));
  router[method](fullPath, ...middlewares);
}

function buildProxyRouteMiddlewares<TClaims = unknown>(
  route: ProxyRoute<TClaims>,
  authMiddleware: RequestHandler | undefined,
  observability: ObservabilityConfig<TClaims> | undefined,
  logger: Logger,
  proxyHandler: RequestHandler,
): RequestHandler[] {
  const middlewares: RequestHandler[] = [];
  if (route.access !== 'public' && authMiddleware) {
    middlewares.push(authMiddleware);
  }
  if (route.authorize) {
    middlewares.push(createAuthorizeMiddleware(route.authorize, logger));
  }
  if (observability) {
    const routeObs = createObservationMiddleware(observability, route.observe, logger);
    if (routeObs) middlewares.push(routeObs);
  }
  middlewares.push(proxyHandler);
  return middlewares;
}

function registerProxyRoute<TClaims = unknown>(
  router: Router,
  route: ProxyRoute<TClaims>,
  authMiddleware: RequestHandler | undefined,
  observability: ObservabilityConfig<TClaims> | undefined,
  logger: Logger,
): void {
  const fullPath = route.path;
  const proxyHandler = createProxyService<TClaims>(
    route.target,
    route.path,
    route.proxyPath,
    route.identity,
    route.transform,
    route.timeout,
    logger,
  );
  type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';
  const methods = route.methods as HttpMethod[];
  for (const method of methods) {
    const middlewares = buildProxyRouteMiddlewares(
      route,
      authMiddleware,
      observability,
      logger,
      proxyHandler,
    );
    router[method](fullPath, ...middlewares);
  }
}

export async function registerRoutes<TClaims = unknown>(
  app: Express | Router,
  config: ServerConfig<TClaims>,
  logger: Logger,
): Promise<void> {
  const { apiRoutes, proxyRoutes, observability } = config;
  const router = app as Router;
  const authMiddleware = await createAuthMiddlewareFromConfig<TClaims>(config);

  if (apiRoutes) {
    for (const route of apiRoutes) {
      registerApiRoute(router, route, authMiddleware, observability, logger);
    }
  }

  if (proxyRoutes) {
    for (const route of proxyRoutes) {
      registerProxyRoute(router, route, authMiddleware, observability, logger);
    }
  }
}
