import type { Context, MiddlewareHandler, Next } from 'hono';
import { asInternalLogger, DEFAULTS } from '../config/defaults';
import { extractBearerClaims, extractJwksClaims } from '../middleware/auth';
import { buildRequestContextFromHono } from '../services/proxy';
import type { AuthorizeFn, HalideContext } from '../types/api';
import type { Logger, RequestContext } from '../types/app';
import type { ClaimExtractor } from '../types/security';
import type { ServerConfig } from '../types/server-config';
import { createSecretCache } from '../utils/secretCache';

function stringSecretFetcher(s: string): () => string | Promise<string> {
  return () => s;
}

export function createAuthErrorResponse(c: Context, status: number, message: string): Response {
  return c.json({ error: message }, { status: status as 400 | 401 | 403 | 404 | 500 } as const);
}

export function createClaimExtractor<TClaims = unknown, TLogScope = unknown>(
  config: ServerConfig<TClaims, TLogScope>,
  logger: Logger<TLogScope>,
): ClaimExtractor<TClaims> | undefined {
  const auth = config.security?.auth;
  if (!auth) return undefined;

  if (auth.strategy === 'jwks' && auth.jwksUri) {
    const { jwksUri, audience, algorithms } = auth;
    return (c: Context): Promise<TClaims | null> =>
      extractJwksClaims<TClaims>(c, jwksUri, audience, algorithms);
  }

  if (auth.secret) {
    const { secret, audience, secretTtl, algorithms } = auth;
    const ttl = secretTtl ?? DEFAULTS.auth.secretTtl;
    const cachedResolver = createSecretCache(ttl, logger);
    const secretFetcher: () => string | Promise<string> =
      typeof secret === 'string' ? stringSecretFetcher(secret) : secret;
    return async (c: Context): Promise<TClaims | null> => {
      const resolvedSecret = await cachedResolver(secretFetcher);
      return extractBearerClaims<TClaims>(c, resolvedSecret, audience, algorithms);
    };
  }

  return undefined;
}

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

export async function checkAuthorization<TClaims = unknown, TLogScope = unknown>(
  c: Context,
  route: { authorize?: AuthorizeFn<TClaims, TLogScope> },
  app: HalideContext<TClaims, TLogScope>,
  body: unknown,
  logger: Logger<TLogScope>,
): Promise<Response | null> {
  if (!route.authorize) return null;
  try {
    const ctx = buildRequestContextFromHono(c, body) as RequestContext;
    const allowed = await route.authorize(ctx, app);
    if (!allowed) {
      return createAuthErrorResponse(c, 403, 'Forbidden');
    }
    return null;
  } catch (err) {
    asInternalLogger(logger).error(
      {},
      `authorize function threw: ${err instanceof Error ? err.message : String(err)}`,
    );
    return createAuthErrorResponse(c, 403, 'Forbidden');
  }
}

export function createAuthMiddleware<TClaims = unknown, TLogScope = unknown>(
  route: { access: string; authorize?: AuthorizeFn<TClaims, TLogScope> },
  claimExtractor: ClaimExtractor<TClaims> | undefined,
  logger: Logger<TLogScope>,
): MiddlewareHandler {
  return async (c: Context, next: Next) => {
    const { claims, response: authResponse } = await extractClaims(c, route, claimExtractor);
    if (authResponse) return authResponse;

    const body = c.get('parsedBody');
    const appCtx: HalideContext<TClaims, TLogScope> = { claims, logger };

    const forbidResponse = await checkAuthorization(c, route, appCtx, body, logger);
    if (forbidResponse) return forbidResponse;

    c.set('claims', claims);
    return next();
  };
}
