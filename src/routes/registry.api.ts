import type { Context, Hono, MiddlewareHandler } from 'hono';
import { describeRoute, validator } from 'hono-openapi';
import { DEFAULTS } from '../config/defaults';
import { createSecurityMiddleware } from '../middleware/security.js';
import { buildRequestContextFromHono } from '../services/proxy';
import type { ApiRoute } from '../types/api';
import type {
  HalideContext,
  HalideVariables,
  ObservabilityConfig,
  RequestContext,
  THalideApp,
} from '../types/app';
import type { CspDirectives } from '../types/csp.js';
import type { ClaimExtractor } from '../types/security';
import { resolveBody } from './body.js';
import {
  checkAuthorization,
  emitOnRequest,
  emitOnResponse,
  extractClaims,
} from './registry.auth.js';
import { registerRouteOnApp as registerRouteOnAppFn } from './registry.js';
import { buildDescribeRouteOptions } from './registry.openapi.js';

/** Register an API route with validator, describeRoute, auth, and handler middleware. */
export function registerApiRoute<TApp extends HalideContext = HalideContext>(
  app: Hono<{ Variables: HalideVariables }>,
  route: ApiRoute<TApp>,
  claimExtractor: ClaimExtractor<THalideApp<TApp>['claims']> | undefined,
  observability: ObservabilityConfig<TApp> | undefined,
  logger: THalideApp['logger'],
  globalCsp?: CspDirectives,
): void {
  const method = route.method ?? DEFAULTS.route.method;
  const middlewares: MiddlewareHandler[] = [];

  if (route.requestSchema) {
    middlewares.push(validator('json', route.requestSchema));
  }

  if (route.csp) {
    middlewares.push(createSecurityMiddleware(globalCsp ?? {}, route.csp));
  }

  middlewares.push(describeRoute(buildDescribeRouteOptions(route)), async (c: Context) => {
    const start = Date.now();
    let handlerError: Error | undefined;
    let statusCode = 200;

    const { claims, response: authResponse } = await extractClaims(c, route, claimExtractor);
    if (authResponse) return authResponse;

    const authBody = route.requestSchema ? resolveBody(c, route) : undefined;
    const appCtx: TApp = { claims, logger } as TApp;
    const reqCtx = buildRequestContextFromHono(c, authBody) as RequestContext;
    const forbidResponse = await checkAuthorization(c, route, appCtx, authBody, reqCtx);
    if (forbidResponse) return forbidResponse;

    emitOnRequest(c, authBody, appCtx, observability, route.observe, logger, reqCtx);

    const body = await resolveBody(c, route);

    let result: unknown;
    try {
      const handlerCtx = reqCtx as RequestContext & { body: unknown };
      handlerCtx.body = body;
      result = await route.handler(handlerCtx, appCtx);
    } catch (err) {
      handlerError = err instanceof Error ? err : new Error(String(err));
      statusCode = 500;
      throw err;
    } finally {
      emitOnResponse(
        c,
        body,
        appCtx,
        observability,
        route.observe,
        { handlerError, start, statusCode },
        result,
        logger,
        reqCtx,
      );
    }

    return c.json(result);
  });

  registerRouteOnAppFn(app, method, route.path, ...middlewares);
}
