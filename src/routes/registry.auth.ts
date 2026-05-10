import type { Context } from 'hono';
import { DEFAULTS } from '../config/defaults';
import { extractBearerClaims, extractJwksClaims } from '../middleware/auth';
import { buildRequestContextFromHono } from '../services/proxy';
import type { ApiRoute, AuthorizeFn } from '../types/api';
import type { ObservabilityConfig, THalideApp } from '../types/app';
import type { ClaimExtractor } from '../types/security';
import type { ServerConfig } from '../types/server-config';
import { createSecretCache } from '../utils/secretCache';

/** Create a claim extractor from config, returning undefined when no auth is configured. */
export function createClaimExtractor<TApp = unknown>(
  config: ServerConfig<TApp>,
  logger: THalideApp['logger'],
): ClaimExtractor<THalideApp<TApp>['claims']> | undefined {
  const auth = config.security?.auth;
  if (!auth) return undefined;

  if (auth.strategy === 'jwks' && auth.jwksUri) {
    const { jwksUri, audience } = auth;
    return (c: Context) => extractJwksClaims<THalideApp<TApp>['claims']>(c, jwksUri, audience);
  }

  if (auth.secret) {
    const { secret, audience, secretTtl } = auth;
    const ttl = secretTtl ?? DEFAULTS.auth.secretTtl;
    const cachedResolver = createSecretCache(ttl, logger);
    return async (c: Context) => {
      const resolvedSecret = await cachedResolver(secret);
      return extractBearerClaims<THalideApp<TApp>['claims']>(c, resolvedSecret, audience);
    };
  }

  return undefined;
}

/** Extract JWT claims from request using the claim extractor, returning null response on failure. */
export async function extractClaims<TApp>(
  c: Context,
  route: { access: string },
  claimExtractor: ClaimExtractor<THalideApp<TApp>['claims']> | undefined,
): Promise<{ claims: THalideApp<TApp>['claims'] | undefined; response: Response | null }> {
  if (route.access === 'public' || !claimExtractor) {
    return { claims: undefined, response: null };
  }
  const extracted = await claimExtractor(c);
  if (extracted === null) {
    return {
      claims: undefined,
      response: new Response(JSON.stringify({ error: 'Unauthorized' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 401,
      }),
    };
  }
  return { claims: extracted, response: null };
}

/** Check authorization by calling the route's authorize function, returning a 403 response if denied. */
export async function checkAuthorization<TApp>(
  c: Context,
  route: { authorize?: AuthorizeFn<TApp> },
  app: TApp,
  body: unknown,
): Promise<Response | null> {
  if (!route.authorize) return null;
  try {
    const ctx = buildRequestContextFromHono(c, body);
    const allowed = await route.authorize(ctx, app);
    if (!allowed) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 403,
      });
    }
    return null;
  } catch {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      headers: { 'Content-Type': 'application/json' },
      status: 403,
    });
  }
}

/** Emit the onRequest observability hook if configured and not disabled on the route. */
export function emitOnRequest<TApp>(
  c: Context,
  body: unknown,
  app: TApp,
  observability: ObservabilityConfig<TApp> | undefined,
  observe: boolean | undefined,
): void {
  if (observability?.onRequest && observe !== false) {
    const ctx = buildRequestContextFromHono(c, body);
    observability.onRequest(ctx, app);
  }
}

/** Context object capturing error, start time, and status code for the onResponse hook. */
interface ResponseEmitContext {
  /** Error thrown by the handler, if any. */
  handlerError: Error | undefined;
  /** Timestamp (Date.now()) when request processing started. */
  start: number;
  /** HTTP status code of the response. */
  statusCode: number;
}

/** Emit the onResponse observability hook if configured and not disabled on the route. */
export function emitOnResponse<TApp>(
  c: Context,
  body: unknown,
  app: TApp,
  observability: ObservabilityConfig<TApp> | undefined,
  observe: boolean | undefined,
  ctx: ResponseEmitContext,
  responseBody?: unknown,
): void {
  if (observability?.onResponse && observe !== false) {
    const reqCtx = buildRequestContextFromHono(c, body);
    observability.onResponse(reqCtx, app, {
      body: responseBody,
      durationMs: Date.now() - ctx.start,
      error: ctx.handlerError,
      statusCode: ctx.statusCode,
    });
  }
}

/** Get validated JSON from request using the hono-openapi Zod validation schema. */
export function getValidJson(c: Context): unknown {
  return (c.req as unknown as { valid: (t: string) => unknown }).valid('json');
}

/** Resolve request body, using request schema if available, otherwise parsing JSON for POST/PUT/PATCH. */
export function resolveBody<TApp>(c: Context, route: ApiRoute<TApp>): unknown {
  if (route.requestSchema) return getValidJson(c);
  const methodsWithBody = new Set(['POST', 'PUT', 'PATCH']);
  return methodsWithBody.has(c.req.method.toUpperCase())
    ? c.req.json().catch(() => undefined)
    : undefined;
}
