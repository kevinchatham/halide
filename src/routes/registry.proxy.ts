import type { Context, Hono, MiddlewareHandler } from 'hono';
import { describeRoute } from 'hono-openapi';
import { createSecurityMiddleware } from '../middleware/security.js';
import type { AgentCache } from '../services/proxy';
import { buildRequestContextFromHono, createProxyService } from '../services/proxy';
import type { ProxyRoute } from '../types/api';
import type {
  HalideContext,
  HalideVariables,
  ObservabilityConfig,
  RequestContext,
  THalideApp,
} from '../types/app';
import type { CspDirectives } from '../types/csp.js';
import type { ClaimExtractor } from '../types/security';
import {
  checkAuthorization,
  emitOnRequest,
  emitOnResponse,
  extractClaims,
} from './registry.auth.js';
import { registerRouteOnApp as registerRouteOnAppFn } from './registry.js';
import { buildDescribeRouteOptions } from './registry.openapi.js';

/** Register a proxy route with auth, observability, and proxy forwarding for each configured method. */
export function registerProxyRoute<TApp extends HalideContext = HalideContext>(
  app: Hono<{ Variables: HalideVariables }>,
  route: ProxyRoute<TApp>,
  claimExtractor: ClaimExtractor<THalideApp<TApp>['claims']> | undefined,
  observability: ObservabilityConfig<TApp> | undefined,
  logger: THalideApp['logger'],
  agentCache: AgentCache,
  globalCsp?: CspDirectives,
): void {
  for (const method of route.methods) {
    const middlewares: MiddlewareHandler[] = [describeRoute(buildDescribeRouteOptions(route))];

    if (route.csp) {
      middlewares.push(createSecurityMiddleware(globalCsp ?? {}, route.csp));
    }

    middlewares.push(async (c: Context) => {
      const start = Date.now();
      let handlerError: Error | undefined;
      let pipeError: Error | undefined;
      let statusCode = 200;
      let proxyResponseBody: unknown;

      let parsedBody: unknown;
      if (route.transform) {
        parsedBody = await c.req.json().catch(() => ({}));
        c.set('rawBody', parsedBody);
      }

      const { claims, response: authResponse } = await extractClaims(c, route, claimExtractor);
      if (authResponse) return authResponse;

      const appCtx: TApp = { claims, logger } as TApp;
      const reqCtx = buildRequestContextFromHono(c, parsedBody) as RequestContext;
      const forbidResponse = await checkAuthorization(c, route, appCtx, parsedBody, reqCtx);
      if (forbidResponse) return forbidResponse;

      emitOnRequest(c, parsedBody, appCtx, observability, route.observe, logger, reqCtx);

      try {
        const proxyHandler = createProxyService(route, appCtx, agentCache, parsedBody);
        const response = await proxyHandler(c);
        statusCode = response.status;

        if (route.observe === false) {
          return response;
        }

        const body = response.body;
        const abortController = new AbortController();
        c.req.raw?.signal?.addEventListener('abort', () => abortController.abort());

        if (body) {
          const { readable, writable } = new TransformStream();
          const reader = body.getReader();
          const writer = writable.getWriter();
          const collected: Uint8Array[] = [];
          const maxCollect = observability?.maxCollect ?? 1024;
          let collectedBytes = 0;

          async function pipe(): Promise<void> {
            try {
              while (true) {
                if (abortController.signal.aborted) break;
                const { done, value } = await reader.read();
                if (done) break;
                if (abortController.signal.aborted) break;
                if (collectedBytes < maxCollect && value) {
                  const slice = value.slice(0, Math.max(0, maxCollect - collectedBytes));
                  collected.push(slice);
                  collectedBytes += slice.length;
                }
                await writer.write(value);
              }
              await writer.close();
            } catch (err) {
              pipeError = err instanceof Error ? err : new Error(String(err));
              await writer.close();
            }
          }

          if (abortController.signal.aborted) {
            reader.cancel();
            writer.abort();
            handlerError = new Error('Client disconnected');
            statusCode = 499;
            return;
          }

          const pipePromise = pipe();

          const responseBodyText =
            collected.length > 0
              ? await new Response(new Blob(collected as BlobPart[])).text()
              : undefined;

          await pipePromise;

          if (abortController.signal.aborted) {
            handlerError = new Error('Client disconnected');
            statusCode = 499;
            return;
          }

          proxyResponseBody = responseBodyText;
          const responseInit: ResponseInit = {
            headers: response.headers,
            status: response.status,
          };
          return new Response(readable as ReadableStream<Uint8Array>, responseInit);
        }

        return response;
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
          c,
          parsedBody,
          appCtx,
          observability,
          route.observe,
          { handlerError, start, statusCode },
          proxyResponseBody,
          logger,
          reqCtx,
        );
      }
    });

    registerRouteOnAppFn(app, method, route.path, ...middlewares);
  }
}
