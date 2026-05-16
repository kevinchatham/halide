import type { Context, MiddlewareHandler, Next } from 'hono';
import { MAX_EXTRACTOR_CACHE } from '../config/constants';
import { createScopedLogger, DEFAULTS } from '../config/defaults';
import { extractBearerClaims, extractJwksClaims } from '../middleware/auth';
import { buildRequestContextFromHono } from '../services/proxy';
import type { AuthorizeFn, HalideContext } from '../types/api';
import type { Logger, ObservabilityConfig, RequestContext } from '../types/app';
import type { ClaimExtractor } from '../types/security';
import type { ServerConfig } from '../types/server-config';
import { createSecretCache } from '../utils/secretCache';

/** Wrap a string secret as a fetcher function that returns the secret synchronously. */
function stringSecretFetcher(s: string): () => string | Promise<string> {
  return () => s;
}

/**
 * Cache for claim extractors keyed by auth strategy.
 * Evicts the oldest entry (FIFO) when the cache exceeds MAX_EXTRACTOR_CACHE.
 */
export class ClaimExtractorCache {
  private readonly cache = new Map<string, ClaimExtractor<unknown> | undefined>();

  get(key: string): ClaimExtractor<unknown> | undefined {
    return this.cache.get(key);
  }

  set(key: string, value: ClaimExtractor<unknown> | undefined): void {
    if (this.cache.size >= MAX_EXTRACTOR_CACHE) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }

  reset(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

/** Create a ClaimExtractorCache instance. */
export function createClaimExtractorCache(): ClaimExtractorCache {
  return new ClaimExtractorCache();
}

/** No-op claim extractor cache for use when no auth is configured. */
export const NOOP_EXTRACTOR_CACHE = new ClaimExtractorCache();

/** Create a JSON error response for authentication/authorization failures. */
export function createAuthErrorResponse(c: Context, status: number, message: string): Response {
  return c.json({ error: message }, { status: status as 400 | 401 | 403 | 404 | 500 } as const);
}

/**
 * Create a claim extractor from config, returning undefined when no auth is
 * configured.
 *
 * Selects between JWKS or bearer extraction based on the auth strategy.
 * Results are cached by auth strategy key for reuse across calls.
 *
 * @typeParam TClaims - The type of the decoded JWT claims.
 * @typeParam TLogScope - The type of the structured log scope object.
 * @param config - The server configuration containing auth settings.
 * @param logger - Logger instance for error reporting.
 * @param cache - The claim extractor cache instance.
 * @returns A claim extractor function or undefined when auth is disabled.
 */
export function createClaimExtractor<TClaims = unknown, TLogScope = unknown>(
  config: ServerConfig<TClaims, TLogScope>,
  logger: Logger<TLogScope>,
  cache: ClaimExtractorCache = NOOP_EXTRACTOR_CACHE,
): ClaimExtractor<TClaims> | undefined {
  const auth = config.security?.auth;
  if (!auth) return undefined;

  const key = auth.strategy || 'none';
  const cached = cache.get(key);
  if (cached) return cached as ClaimExtractor<TClaims> | undefined;

  let result: ClaimExtractor<unknown> | undefined;

  if (auth.strategy === 'jwks' && auth.jwksUri) {
    const { jwksUri, audience } = auth;
    result = (c: Context): Promise<TClaims | null> =>
      extractJwksClaims<TClaims>(c, jwksUri, audience);
  } else if (auth.secret) {
    const { secret, audience, secretTtl, algorithms } = auth;
    const ttl = secretTtl ?? DEFAULTS.auth.secretTtl;
    const cachedResolver = createSecretCache(ttl, logger);
    const secretFetcher: () => string | Promise<string> =
      typeof secret === 'string' ? stringSecretFetcher(secret) : secret;
    result = async (c: Context): Promise<TClaims | null> => {
      const resolvedSecret = await cachedResolver(secretFetcher);
      return extractBearerClaims<TClaims>(c, resolvedSecret, audience, algorithms);
    };
  }

  if (result) {
    cache.set(key, result);
  }
  return result as ClaimExtractor<TClaims> | undefined;
}

/**
 * Extract JWT claims from request using the claim extractor, returning null
 * response on failure.
 *
 * Skips extraction for public routes or when no auth is configured.
 *
 * @typeParam TClaims - The type of the decoded JWT claims.
 * @param c - The Hono context.
 * @param route - The route, which determines access level.
 * @param claimExtractor - The configured claim extractor function.
 * @returns The extracted claims and a response to return on authentication failure.
 */
export async function extractClaims<TClaims = unknown>(
  c: Context,
  route: { access: string },
  claimExtractor: ClaimExtractor<TClaims> | undefined,
): Promise<{ claims: TClaims | undefined; response: Response | null }> {
  if (route.access === 'public' || !claimExtractor) {
    return { claims: undefined, response: null };
  }
  const extracted = await claimExtractor(c);
  if (extracted === null) {
    return {
      claims: undefined,
      response: createAuthErrorResponse(c, 401, 'Unauthorized'),
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
 * @typeParam TClaims - The type of the decoded JWT claims.
 * @typeParam TLogScope - The type of the structured log scope object.
 * @param c - The Hono context.
 * @param route - The route with an optional authorize function.
 * @param app - The bundled app context.
 * @param body - The parsed request body for authorization checks.
 * @param ctx - Pre-built request context to avoid recreation.
 * @returns A 403 response if authorization is denied, or null to continue processing.
 */
export async function checkAuthorization<TClaims = unknown, TLogScope = unknown>(
  c: Context,
  route: { authorize?: AuthorizeFn<TClaims, TLogScope> },
  app: HalideContext<TClaims, TLogScope>,
  _body: unknown,
  ctx: RequestContext,
): Promise<Response | null> {
  if (!route.authorize) return null;
  try {
    const allowed = await route.authorize(ctx, app);
    if (!allowed) {
      return createAuthErrorResponse(c, 403, 'Forbidden');
    }
    return null;
  } catch {
    return createAuthErrorResponse(c, 403, 'Forbidden');
  }
}

/**
 * Emit the onRequest observability hook if configured and not disabled on the route.
 *
 * Skips the hook when `observe` is false or when no onRequest hook is configured.
 * Wraps callback invocations in try/catch to prevent async errors from silently failing.
 *
 * @typeParam TClaims - The type of the decoded JWT claims.
 * @typeParam TLogScope - The type of the structured log scope object.
 * @param config - The emit configuration.
 * @param ctx - Pre-built request context.
 */
export function emitOnRequest<TClaims = unknown, TLogScope = unknown>(
  config: EmitConfig<TClaims, TLogScope>,
  ctx: RequestContext,
): void {
  if (config.observability?.onRequest && config.observe !== false) {
    try {
      const result = config.observability.onRequest(ctx, config.app);
      if (result instanceof Promise) {
        result.catch((err) =>
          config.logger?.error(
            {} as TLogScope,
            `onRequest hook: ${err instanceof Error ? err.message : String(err)}`,
          ),
        );
      }
    } catch (err) {
      config.logger?.error(
        {} as TLogScope,
        `onRequest hook: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

/**
 * Context object capturing error, start time, and status code for the onResponse hook.
 */
interface ResponseEmitContext {
  /** Error thrown by the handler during request processing, if any. */
  handlerError: Error | undefined;
  /** Timestamp (Date.now()) when request processing started. */
  start: number;
  /** HTTP status code of the final response. */
  statusCode: number;
}

/**
 * Common emit configuration shared between onRequest and onResponse hooks.
 * @typeParam TClaims - The type of the decoded JWT claims.
 * @typeParam TLogScope - The type of the structured log scope object.
 */
interface EmitConfig<TClaims = unknown, TLogScope = unknown> {
  /** The bundled app context. */
  app: HalideContext<TClaims, TLogScope>;
  /** The parsed request body. */
  body: unknown;
  /** The Hono context. */
  c: Context;
  /** Logger instance for reporting hook errors. */
  logger?: Logger<TLogScope>;
  /** The observability configuration. */
  observability: ObservabilityConfig<TClaims, TLogScope> | undefined;
  /** Whether observability is enabled for this specific route. */
  observe: boolean | undefined;
}

/**
 * Extended emit configuration for the onResponse hook.
 * @typeParam TClaims - The type of the decoded JWT claims.
 * @typeParam TLogScope - The type of the structured log scope object.
 */
interface ResponseEmitConfig<TClaims = unknown, TLogScope = unknown>
  extends EmitConfig<TClaims, TLogScope> {
  /** Set to 'text' for proxy route response bodies. */
  bodyType?: 'text' | 'binary';
  /** The response emit context with error, start time, and status code. */
  emitCtx: ResponseEmitContext;
  /** The captured response body for logging. */
  responseBody?: unknown;
}

/**
 * Emit the onResponse observability hook if configured and not disabled on the route.
 *
 * Skips the hook when `observe` is false or when no onResponse hook is configured.
 * Computes the response duration from the start timestamp.
 * Wraps callback invocations in try/catch to prevent async errors from silently failing.
 *
 * @typeParam TClaims - The type of the decoded JWT claims.
 * @typeParam TLogScope - The type of the structured log scope object.
 * @param config - The emit configuration.
 * @param ctx - Pre-built request context.
 */
export function emitOnResponse<TClaims = unknown, TLogScope = unknown>(
  config: ResponseEmitConfig<TClaims, TLogScope>,
  ctx: RequestContext,
): void {
  if (config.observability?.onResponse && config.observe !== false) {
    try {
      const result = config.observability.onResponse(ctx, config.app, {
        body: config.responseBody,
        bodyType: config.bodyType,
        durationMs: Date.now() - config.emitCtx.start,
        error: config.emitCtx.handlerError,
        statusCode: config.emitCtx.statusCode,
      });
      if (result instanceof Promise) {
        result.catch((err) =>
          config.logger?.error(
            {} as TLogScope,
            `onResponse hook: ${err instanceof Error ? err.message : String(err)}`,
          ),
        );
      }
    } catch (err) {
      config.logger?.error(
        {} as TLogScope,
        `onResponse hook: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

/**
 * Create an auth middleware that extracts claims, builds context objects,
 * and checks authorization.
 *
 * When `logScopeFactory` is provided, creates a per-request scoped logger
 * that automatically applies the factory's scope to every log call within
 * the request, so handlers and hooks don't need to pass scope manually.
 *
 * Stores c.set('appCtx', { claims, logger }) and c.set('reqCtx', requestCtx)
 * for downstream middleware. Returns 401 on auth failure, 403 on authorization
 * denial.
 *
 * @typeParam TClaims - The type of the decoded JWT claims.
 * @typeParam TLogScope - The type of the structured log scope object.
 * @param route - The route definition (provides access level and authorize function).
 * @param claimExtractor - The configured claim extractor function.
 * @param logger - Base logger instance for error reporting.
 * @param logScopeFactory - Optional per-request factory that produces a typed log scope.
 * @returns A Hono middleware handler.
 */
export function createAuthMiddleware<TClaims = unknown, TLogScope = unknown>(
  route: { access: string; authorize?: AuthorizeFn<TClaims, TLogScope> },
  claimExtractor: ClaimExtractor<TClaims> | undefined,
  logger: Logger<TLogScope>,
  logScopeFactory?: (ctx: RequestContext, claims: TClaims | undefined) => TLogScope,
): MiddlewareHandler {
  return async (c: Context, next: Next) => {
    const { claims, response: authResponse } = await extractClaims(c, route, claimExtractor);
    if (authResponse) return authResponse;

    const body = c.get('parsedBody');
    const reqCtx = buildRequestContextFromHono(c, body) as RequestContext;

    let scopedLogger = logger;
    if (logScopeFactory) {
      const scope = logScopeFactory(reqCtx, claims);
      scopedLogger = createScopedLogger(logger, scope);
    }

    const appCtx: HalideContext<TClaims, TLogScope> = { claims, logger: scopedLogger };

    const forbidResponse = await checkAuthorization(c, route, appCtx, body, reqCtx);
    if (forbidResponse) return forbidResponse;

    c.set('appCtx', appCtx);
    c.set('reqCtx', reqCtx);
    return next();
  };
}
