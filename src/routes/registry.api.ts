import type { Context, Hono, MiddlewareHandler } from 'hono';
import { describeRoute, validator } from 'hono-openapi';
import { DEFAULTS } from '../config/defaults';
import type { ApiRoute } from '../types/api';
import type {
  HalideContext,
  HalideVariables,
  Logger,
  ObservabilityConfig,
  RequestContext,
} from '../types/app';
import type { ClaimExtractor } from '../types/security';
import { registerRouteOnApp as registerRouteOnAppFn } from './registry';
import { createAuthMiddleware } from './registry.auth';
import { createApiBodyParser } from './registry.body';
import { createContextMiddleware } from './registry.context';
import { emitOnRequest, emitOnResponse } from './registry.observability';
import { buildDescribeRouteOptions } from './registry.openapi';
import { observeAndPipeResponse } from './registry.response';

/**
 * Register an API route on the Hono app with validation, route description,
 * auth middleware, context middleware, and handler middleware.
 *
 * Adds request body parsing (via hono-openapi when `requestSchema` is set,
 * or a custom parser for POST/PUT/PATCH), OpenAPI `describeRoute` metadata,
 * JWT auth, request context building, and the handler with observability hooks.
 *
 * @typeParam TClaims - The type of the decoded JWT claims.
 * @typeParam TLogScope - The type of the structured log scope object.
 * @param app - The Hono application to register the route on.
 * @param route - The API route definition.
 * @param claimExtractor - JWT claim extractor function.
 * @param observability - The observability configuration.
 * @param logger - Logger instance for error reporting.
 * @param logScopeFactory - Optional per-request factory that produces a typed log scope.
 */
export function registerApiRoute<TClaims = unknown, TLogScope = unknown>(
  app: Hono<{ Variables: HalideVariables }>,
  route: ApiRoute<TClaims, TLogScope>,
  claimExtractor: ClaimExtractor<TClaims> | undefined,
  observability: ObservabilityConfig<TClaims, TLogScope> | undefined,
  logger: Logger<TLogScope>,
  logScopeFactory?: (ctx: RequestContext, claims: TClaims | undefined) => TLogScope,
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
    createContextMiddleware(logger, logScopeFactory),
    createApiHandler(route, observability, logger),
  );

  registerRouteOnAppFn(app, method, route.path, ...middlewares);
}

/**
 * Create an API handler middleware that executes the route handler and manages
 * response collection and observability hooks.
 *
 * Calls the route handler, pipes responses for observability, and emits
 * onRequest/onResponse hooks. Returns 502 if the pipe fails or 500 on handler errors.
 *
 * @typeParam TClaims - The type of the decoded JWT claims.
 * @typeParam TLogScope - The type of the structured log scope object.
 * @param route - The API route definition.
 * @param observability - The observability configuration.
 * @param logger - Logger instance for error reporting.
 * @returns A Hono middleware handler.
 */
function createApiHandler<TClaims = unknown, TLogScope = unknown>(
  route: ApiRoute<TClaims, TLogScope>,
  observability: ObservabilityConfig<TClaims, TLogScope> | undefined,
  logger: Logger<TLogScope>,
): MiddlewareHandler {
  return async (c: Context) => {
    const start = Date.now();
    let handlerError: Error | undefined;
    let statusCode = 200;
    let proxyResponseBody: string | undefined;
    let pipeError: Error | undefined;
    let responseToReturn: Response | undefined;

    const appCtx = c.get('appCtx') as HalideContext<TClaims, TLogScope>;
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
