import type { Context } from 'hono';
import { DEFAULTS } from '../config/defaults';
import { extractBearerClaims, extractJwksClaims } from '../middleware/auth';
import { buildRequestContextFromHono } from '../services/proxy';
import type { ApiRoute, AuthorizeFn } from '../types/api';
import type { ObservabilityConfig, THalideApp } from '../types/app';
import type { ClaimExtractor } from '../types/security';
import type { ServerConfig } from '../types/server-config';
import { createSecretCache } from '../utils/secretCache';

/** Module-level cache for claim extractors keyed by auth strategy. */
const claimExtractorCache = new Map<string, ClaimExtractor<unknown> | undefined>();

/** Create a JSON error response for authentication/authorization failures. */
export function createAuthErrorResponse(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });
}

/** Clear the claim extractor cache. Intended for testing only. */
export function resetClaimExtractorCache(): void {
  claimExtractorCache.clear();
}

/**
 * Create a claim extractor from config, returning undefined when no auth is
 * configured.
 *
 * Selects between JWKS or bearer extraction based on the auth strategy.
 * Results are cached by auth strategy key for reuse across calls.
 *
 * @typeParam TApp - The bundled app context type combining claims and logger.
 * @param config - The server configuration containing auth settings.
 * @param logger - Logger instance for error reporting.
 * @returns A claim extractor function or undefined when auth is disabled.
 */
export function createClaimExtractor<TApp = unknown>(
  config: ServerConfig<TApp>,
  logger: THalideApp['logger'],
): ClaimExtractor<THalideApp<TApp>['claims']> | undefined {
  const auth = config.security?.auth;
  if (!auth) return undefined;

  const key = auth.strategy || 'none';
  const cached = claimExtractorCache.get(key);
  if (cached) return cached as ClaimExtractor<THalideApp<TApp>['claims']> | undefined;

  let result: ClaimExtractor<unknown> | undefined;

  if (auth.strategy === 'jwks' && auth.jwksUri) {
    const { jwksUri, audience } = auth;
    result = (c: Context): Promise<THalideApp<TApp>['claims'] | null> =>
      extractJwksClaims<THalideApp<TApp>['claims']>(c, jwksUri, audience);
  } else if (auth.secret) {
    const { secret, audience, secretTtl, algorithms } = auth;
    const ttl = secretTtl ?? DEFAULTS.auth.secretTtl;
    const cachedResolver = createSecretCache(ttl, logger);
    result = async (c: Context): Promise<THalideApp<TApp>['claims'] | null> => {
      const resolvedSecret = await cachedResolver(secret);
      return extractBearerClaims<THalideApp<TApp>['claims']>(
        c,
        resolvedSecret,
        audience,
        algorithms,
      );
    };
  }

  if (result) claimExtractorCache.set(key, result);
  return result as ClaimExtractor<THalideApp<TApp>['claims']> | undefined;
}

/**
 * Extract JWT claims from request using the claim extractor, returning null
 * response on failure.
 *
 * Skips extraction for public routes or when no auth is configured.
 *
 * @typeParam TApp - The bundled app context type combining claims and logger.
 * @param c - The Hono context.
 * @param route - The route, which determines access level.
 * @param claimExtractor - The configured claim extractor function.
 * @returns The extracted claims and a response to return on authentication failure.
 */
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
      response: createAuthErrorResponse(401, 'Unauthorized'),
    };
  }
  return { claims: extracted, response: null };
}

/**
 * Check authorization by calling the route's authorize function, returning a
 * 403 response if denied.
 *
 * Returns null immediately when no authorize function is configured on the route.
 *
 * @typeParam TApp - The bundled app context type combining claims and logger.
 * @param c - The Hono context.
 * @param route - The route with an optional authorize function.
 * @param app - The bundled app context.
 * @param body - The parsed request body for authorization checks.
 * @returns A 403 response if authorization is denied, or null to continue processing.
 */
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
      return createAuthErrorResponse(403, 'Forbidden');
    }
    return null;
  } catch {
    return createAuthErrorResponse(403, 'Forbidden');
  }
}

/**
 * Emit the onRequest observability hook if configured and not disabled on the route.
 *
 * Skips the hook when `observe` is false or when no onRequest hook is configured.
 *
 * @typeParam TApp - The bundled app context type combining claims and logger.
 * @param c - The Hono context.
 * @param body - The parsed request body.
 * @param app - The bundled app context.
 * @param observability - The observability configuration.
 * @param observe - Whether observability is enabled for this specific route.
 */
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
  /** Error thrown by the handler during request processing, if any. */
  handlerError: Error | undefined;
  /** Timestamp (Date.now()) when request processing started. */
  start: number;
  /** HTTP status code of the final response. */
  statusCode: number;
}

/**
 * Emit the onResponse observability hook if configured and not disabled on the route.
 *
 * Skips the hook when `observe` is false or when no onResponse hook is configured.
 * Computes the response duration from the start timestamp.
 *
 * @typeParam TApp - The bundled app context type combining claims and logger.
 * @param c - The Hono context.
 * @param body - The parsed request body.
 * @param app - The bundled app context.
 * @param observability - The observability configuration.
 * @param observe - Whether observability is enabled for this specific route.
 * @param ctx - The response emit context with error, start time, and status code.
 * @param responseBody - The captured response body for logging.
 */
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

/**
 * Resolve request body, using request schema if available, otherwise parsing
 * JSON for POST/PUT/PATCH methods.
 *
 * @typeParam TApp - The bundled app context type combining claims and logger.
 * @param c - The Hono context.
 * @param route - The API route, which may have a request schema.
 * @returns The parsed request body or undefined.
 */
export function resolveBody<TApp>(c: Context, route: ApiRoute<TApp>): unknown {
  if (route.requestSchema) return (c.req as { valid: (format: string) => unknown }).valid('json');
  const methodsWithBody = new Set(['POST', 'PUT', 'PATCH']);
  return methodsWithBody.has(c.req.method.toUpperCase())
    ? c.req.json().catch(() => undefined)
    : undefined;
}
