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
import { parseJsonBody } from '../utils/parseJsonBody.js';
import { collectProxyBody } from './proxy-body.js';
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
    let proxyResponseBody: string | undefined;
    let pipeError: Error | undefined;
    let responseToReturn: Response | undefined;

    const { claims, response: authResponse } = await extractClaims(c, route, claimExtractor);
    if (authResponse) return authResponse;

    let body: unknown;
    if (route.requestSchema) {
      body = (c.req as { valid: (format: string) => unknown }).valid('json');
    } else {
      const methodsWithBody = new Set(['POST', 'PUT', 'PATCH']);
      if (methodsWithBody.has(c.req.method.toUpperCase())) {
        const raw = c.req.raw;
        if (raw.body) {
          const parsed = await parseJsonBody(c);
          if (parsed instanceof Response) return parsed;
          body = parsed;
        }
      }
    }
    const appCtx: TApp = { claims, logger } as TApp;
    const reqCtx = buildRequestContextFromHono(c, body) as RequestContext;
    const forbidResponse = await checkAuthorization(c, route, appCtx, body, reqCtx);
    if (forbidResponse) return forbidResponse;

    emitOnRequest({ app: appCtx, body, c, logger, observability, observe: route.observe }, reqCtx);

    let result: unknown;
    try {
      const handlerCtx = reqCtx as RequestContext & { body: unknown };
      handlerCtx.body = body;
      result = await route.handler(handlerCtx, appCtx);

      if (result instanceof Response) {
        statusCode = result.status;

        if (route.observe !== false) {
          const bodyStream = result.body;
          const abortController = new AbortController();
          c.req.raw?.signal?.addEventListener('abort', () => abortController.abort());

          if (bodyStream) {
            const maxCollect = observability?.maxCollect ?? 1024;
            const {
              response: pipedResponse,
              body: responseBodyText,
              error: collectedPipeError,
            } = await collectProxyBody(result, abortController.signal, maxCollect);

            if (abortController.signal.aborted) {
              handlerError = new Error('Client disconnected');
              statusCode = 499;
            } else {
              proxyResponseBody = responseBodyText;
              if (collectedPipeError) {
                pipeError = collectedPipeError;
              }

              responseToReturn = new Response(pipedResponse.body as ReadableStream<Uint8Array>, {
                headers: pipedResponse.headers,
                status: pipedResponse.status,
              });
            }
          } else {
            responseToReturn = result;
          }
        } else {
          responseToReturn = result;
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

    if (responseToReturn) {
      return responseToReturn;
    }

    return c.json(result);
  });

  registerRouteOnAppFn(app, method, route.path, ...middlewares);
}
