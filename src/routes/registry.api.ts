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
    let result: unknown;

    const appCtx = c.get('appCtx') as HalideContext<TClaims, TLogScope>;
    const reqCtx = c.get('reqCtx') as RequestContext;
    const body = c.get('parsedBody');

    emitOnRequest({ app: appCtx, body, c, logger, observability, observe: route.observe }, reqCtx);

    try {
      const {
        handlerValue: handlerResult,
        abort,
        response,
      } = await processResponse(
        route.handler,
        reqCtx,
        body,
        appCtx,
        c,
        observability,
        route.observe,
      );

      if (abort) {
        handlerError = abort;
        statusCode = 499;
      } else if (handlerResult instanceof Response) {
        responseToReturn = response?.response ?? handlerResult;
        statusCode = handlerResult.status;
        result = handlerResult;
        if (response?.body !== undefined) {
          proxyResponseBody = response.body;
        }
      } else {
        result = handlerResult;
      }
    } catch (err) {
      handlerError = err instanceof Error ? err : new Error(String(err));
      statusCode = 500;
      throw err;
    } finally {
      const { finalizedError, finalizedStatus } = finalizeStatus(
        handlerError,
        pipeError,
        statusCode,
      );
      handlerError = finalizedError;
      statusCode = finalizedStatus;
      emitApiOnResponse(
        {
          app: appCtx,
          body,
          bodyType: proxyResponseBody ? 'text' : undefined,
          c,
          emitCtx: { handlerError, start, statusCode },
          logger,
          observability,
          observe: route.observe,
          responseBody: proxyResponseBody ?? result,
          route,
        },
        reqCtx,
      );
    }

    if (responseToReturn) {
      return responseToReturn;
    }

    return c.json(result);
  };
}

/**
 * Process the handler result — handle Response piping and client aborts.
 *
 * @internal
 */
async function processResponse<TClaims, TLogScope>(
  handler: (
    ctx: RequestContext & { body: unknown },
    app: HalideContext<TClaims, TLogScope>,
  ) => unknown,
  reqCtx: RequestContext,
  body: unknown,
  appCtx: HalideContext<TClaims, TLogScope>,
  c: Context,
  observability: ObservabilityConfig<TClaims, TLogScope> | undefined,
  observe: boolean | undefined,
): Promise<{
  handlerValue: unknown;
  response?: { response: Response; statusCode: number; body?: string; pipeError?: Error };
  abort?: Error;
}> {
  const handlerCtx = reqCtx as RequestContext & { body: unknown };
  handlerCtx.body = body;
  const result = handler(handlerCtx, appCtx);

  if (!(result instanceof Promise)) {
    return { handlerValue: result };
  }

  const awaited = await result;

  if (!(awaited instanceof Response)) {
    return { handlerValue: awaited };
  }

  try {
    const pipeResult = await observeAndPipeResponse(c, awaited, observability, observe);
    if (pipeResult.aborted) {
      return { abort: new Error('Client disconnected'), handlerValue: awaited };
    }
    return {
      handlerValue: awaited,
      response: {
        body: pipeResult.body,
        pipeError: pipeResult.pipeError,
        response: pipeResult.response,
        statusCode: awaited.status,
      },
    };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    throw error;
  }
}

/**
 * Determine final error and status code after handler execution.
 *
 * @internal
 */
function finalizeStatus(
  handlerError: Error | undefined,
  pipeError: Error | undefined,
  statusCode: number,
): { finalizedError: Error | undefined; finalizedStatus: number } {
  if (pipeError && !handlerError) {
    return { finalizedError: pipeError, finalizedStatus: 502 };
  }
  return { finalizedError: handlerError, finalizedStatus: statusCode };
}

/** Config for {@link emitApiOnResponse}. */
/** @internal */
interface ApiOnResponseConfig<TClaims = unknown, TLogScope = unknown> {
  readonly app: HalideContext<TClaims, TLogScope>;
  readonly body: unknown;
  readonly bodyType: 'text' | 'binary' | undefined;
  readonly c: Context;
  readonly emitCtx: {
    readonly handlerError: Error | undefined;
    readonly start: number;
    readonly statusCode: number;
  };
  readonly logger: Logger<TLogScope>;
  readonly observability: ObservabilityConfig<TClaims, TLogScope> | undefined;
  readonly observe: boolean | undefined;
  readonly responseBody: unknown;
  readonly route: ApiRoute<TClaims, TLogScope>;
}

/**
 * Emit the onResponse hook for API routes.
 *
 * @internal
 */
function emitApiOnResponse<TClaims, TLogScope>(
  config: ApiOnResponseConfig<TClaims, TLogScope>,
  reqCtx: RequestContext,
): void {
  if (config.route.observe !== false) {
    emitOnResponse(
      {
        app: config.app,
        body: config.body,
        bodyType: config.bodyType,
        c: config.c,
        emitCtx: config.emitCtx,
        logger: config.logger,
        observability: config.observability,
        observe: config.observe,
        responseBody: config.responseBody,
      },
      reqCtx,
    );
  }
}
