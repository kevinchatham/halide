import type { Context, Hono, MiddlewareHandler } from 'hono';
import { describeRoute } from 'hono-openapi';
import type { AgentCache } from '../services/proxy';
import { createProxyService } from '../services/proxy';
import type { HalideContext, ProxyRoute } from '../types/api';
import type { HalideVariables, Logger, ObservabilityConfig, RequestContext } from '../types/app';
import type { ClaimExtractor } from '../types/security';
import { registerRouteOnApp as registerRouteOnAppFn } from './registry';
import { createAuthMiddleware } from './registry.auth';
import { createProxyBodyParser } from './registry.body';
import { emitOnRequest, emitOnResponse } from './registry.observability';
import { buildDescribeRouteOptions } from './registry.openapi';
import { observeAndPipeResponse } from './registry.response';

/** Register a proxy route with auth, observability, and proxy forwarding for each configured method. */
export function registerProxyRoute<TClaims = unknown, TLogScope = unknown>(
  app: Hono<{ Variables: HalideVariables }>,
  route: ProxyRoute<TClaims, TLogScope>,
  claimExtractor: ClaimExtractor<TClaims> | undefined,
  observability: ObservabilityConfig<TClaims, TLogScope> | undefined,
  logger: Logger<TLogScope>,
  agentCache: AgentCache,
  logScopeFactory?: (ctx: RequestContext, claims: TClaims | undefined) => TLogScope,
): void {
  for (const method of route.methods) {
    const middlewares: MiddlewareHandler[] = [describeRoute(buildDescribeRouteOptions(route))];

    middlewares.push(
      createProxyBodyParser(route),
      createAuthMiddleware(route, claimExtractor, logger, logScopeFactory),
      createProxyHandler(route, agentCache, observability, logger),
    );

    registerRouteOnAppFn(app, method, route.path, ...middlewares);
  }
}

/**
 * Create a proxy handler middleware that executes the proxy service and manages
 * response collection and observability hooks.
 *
 * Calls `createProxyService` to forward the request, pipes the response for
 * observability, and emits onRequest/onResponse hooks. Returns 502 if the
 * pipe fails or 500 on handler errors.
 *
 * @typeParam TClaims - The type of the decoded JWT claims.
 * @typeParam TLogScope - The type of the structured log scope object.
 * @param route - The proxy route definition.
 * @param agentCache - The HTTP agent cache for proxy connections.
 * @param observability - The observability configuration.
 * @param logger - Logger instance for error reporting.
 * @returns A Hono middleware handler.
 */
function createProxyHandler<TClaims = unknown, TLogScope = unknown>(
  route: ProxyRoute<TClaims, TLogScope>,
  agentCache: AgentCache,
  observability: ObservabilityConfig<TClaims, TLogScope> | undefined,
  logger: Logger<TLogScope>,
): MiddlewareHandler {
  return async (c: Context) => {
    const start = Date.now();
    let handlerError: Error | undefined;
    let pipeError: Error | undefined;
    let statusCode = 200;
    let proxyResponseBody: unknown;

    const appCtx = c.get('appCtx') as HalideContext<TClaims, TLogScope>;
    const reqCtx = c.get('reqCtx') as RequestContext;
    const body = c.get('parsedBody');

    emitOnRequest({ app: appCtx, body, c, logger, observability, observe: route.observe }, reqCtx);

    try {
      const proxyHandler = createProxyService(route, appCtx, agentCache, body);
      const response = await proxyHandler(c);
      statusCode = response.status;

      if (route.observe === false) {
        return response;
      }

      const pipeResult = await observeAndPipeResponse(c, response, observability, route.observe);

      if (pipeResult.aborted) {
        handlerError = new Error('Client disconnected');
        statusCode = 499;
        return;
      }

      proxyResponseBody = pipeResult.body;
      if (pipeResult.pipeError) {
        pipeError = pipeResult.pipeError;
      }

      return pipeResult.response;
    } catch (err) {
      handlerError = err instanceof Error ? err : new Error(String(err));
      statusCode = 500;
      throw err;
    } finally {
      if (pipeError && !handlerError) {
        handlerError = pipeError;
        statusCode = 502;
      }
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
          responseBody: proxyResponseBody,
        },
        reqCtx,
      );
    }
  };
}
