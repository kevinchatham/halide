import type { Context, Hono, MiddlewareHandler } from 'hono';
import { describeRoute, validator } from 'hono-openapi';
import { DEFAULTS } from '../config/defaults';
import type { ApiRoute } from '../types/api';
import type {
  HalideContext,
  HalideVariables,
  ObservabilityConfig,
  RequestContext,
  THalideApp,
} from '../types/app';
import type { ClaimExtractor } from '../types/security';
import { registerRouteOnApp as registerRouteOnAppFn } from './registry';
import { createAuthMiddleware, emitOnRequest, emitOnResponse } from './registry.auth';
import { createApiBodyParser } from './registry.body';
import { buildDescribeRouteOptions } from './registry.openapi';
import { observeAndPipeResponse } from './registry.response';

/** Register an API route with validator, describeRoute, auth, and handler middleware. */
export function registerApiRoute<TApp extends HalideContext = HalideContext>(
  app: Hono<{ Variables: HalideVariables }>,
  route: ApiRoute<TApp>,
  claimExtractor: ClaimExtractor<THalideApp<TApp>['claims']> | undefined,
  observability: ObservabilityConfig<TApp> | undefined,
  logger: THalideApp['logger'],
): void {
  const method = route.method ?? DEFAULTS.route.method;
  const middlewares: MiddlewareHandler[] = [];

  if (route.requestSchema) {
    middlewares.push(validator('json', route.requestSchema));
  }

  middlewares.push(
    describeRoute(buildDescribeRouteOptions(route)),
    createApiBodyParser(route),
    createAuthMiddleware(route, claimExtractor, logger),
    createApiHandler(route, observability, logger),
  );

  registerRouteOnAppFn(app, method, route.path, ...middlewares);
}

/**
 * Create an API handler middleware that executes the route handler and manages
 * response collection and observability hooks.
 *
 * @typeParam TApp - The bundled app context type combining claims and logger.
 * @param route - The API route definition.
 * @param observability - The observability configuration.
 * @param logger - Logger instance for error reporting.
 * @returns A Hono middleware handler.
 */
function createApiHandler<TApp extends HalideContext = HalideContext>(
  route: ApiRoute<TApp>,
  observability: ObservabilityConfig<TApp> | undefined,
  logger: THalideApp['logger'],
): MiddlewareHandler {
  return async (c: Context) => {
    const start = Date.now();
    let handlerError: Error | undefined;
    let statusCode = 200;
    let proxyResponseBody: string | undefined;
    let pipeError: Error | undefined;
    let responseToReturn: Response | undefined;

    const appCtx = c.get('appCtx') as TApp;
    const reqCtx = c.get('reqCtx') as RequestContext;
    const body = c.get('parsedBody');

    emitOnRequest({ app: appCtx, body, c, logger, observability, observe: route.observe }, reqCtx);

    let result: unknown;
    try {
      const handlerCtx = reqCtx as RequestContext & { body: unknown };
      handlerCtx.body = body;
      result = await route.handler(handlerCtx, appCtx);

      if (result instanceof Response) {
        statusCode = result.status;
        const pipeResult = await observeAndPipeResponse(c, result, observability, route.observe);

        if (pipeResult.aborted) {
          handlerError = new Error('Client disconnected');
          statusCode = 499;
        } else {
          proxyResponseBody = pipeResult.body;
          if (pipeResult.pipeError) {
            pipeError = pipeResult.pipeError;
          }
          responseToReturn = pipeResult.response;
        }
      }
    } catch (err) {
      handlerError = err instanceof Error ? err : new Error(String(err));
      statusCode = 500;
      throw err;
    } finally {
      if (pipeError && !handlerError) {
        handlerError = pipeError;
        statusCode = 502;
      }
      if (route.observe !== false) {
        emitOnResponse(
          {
            app: appCtx,
            body,
            bodyType: proxyResponseBody !== undefined ? 'text' : undefined,
            c,
            emitCtx: { handlerError, start, statusCode },
            logger,
            observability,
            observe: route.observe,
            responseBody: proxyResponseBody !== undefined ? proxyResponseBody : result,
          },
          reqCtx,
        );
      }
    }

    if (responseToReturn) {
      return responseToReturn;
    }

    return c.json(result);
  };
}
