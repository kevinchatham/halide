import process from 'node:process';
import { styleText } from 'node:util';

import type { AuthorizeFn } from '../types/api';
import type { HalideContext, InternalLogger, Logger, RequestContext } from '../types/app';
import type { CspDirectives } from '../types/csp';
import {
  DEFAULT_MAX_FREE_SOCKETS,
  DEFAULT_MAX_SOCKETS,
  DEFAULT_PORT,
  DEFAULT_PROXY_TIMEOUT_MS,
  DEFAULT_RATE_LIMIT_MAX_REQUESTS,
  DEFAULT_RATE_LIMIT_WINDOW_MS,
  SECRET_CACHE_TTL_SECONDS,
} from './constants';

/**
 * Default configuration values used when options are omitted.
 * These are applied during server creation in `createApp` and `createServer`.
 */
export const DEFAULTS = {
  app: {
    apiPrefix: '/api',
    fallback: 'index.html',
    name: 'app',
    port: DEFAULT_PORT,
  },
  auth: {
    secretTtl: SECRET_CACHE_TTL_SECONDS,
  },
  cors: {
    credentials: false,
    methods: ['get', 'post', 'put', 'delete', 'patch'] as string[],
    origin: [] as string[],
  },
  csp: {
    default: {
      baseUri: ["'self'"],
      defaultSrc: ["'self'"],
      fontSrc: ["'self'", 'https:', 'data:'],
      formAction: ["'self'"],
      frameAncestors: ["'self'"],
      frameSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      objectSrc: ["'none'"],
      scriptSrc: ["'self'"],
      scriptSrcAttr: ["'none'"],
      /**
       * Only allows stylesheets from the same origin. To allow CDN-hosted
       * stylesheets, override this directive with specific CDN hostnames
       * (e.g., `["'self'", 'https://cdn.jsdelivr.net']`).
       */
      styleSrc: ["'self'"],
      upgradeInsecureRequests: [],
    },
    openapiOverrides: {
      connectSrc: ["'self'", 'https:'],
      fontSrc: ["'self'", 'https:', 'data:'],
      imgSrc: ["'self'", 'data:', 'https:'],
      scriptSrc: ["'self'", 'https://cdn.jsdelivr.net', "'unsafe-inline'"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", 'https:', "'unsafe-inline'"],
      styleSrcAttr: ["'unsafe-inline'"],
    } as Partial<CspDirectives>,
  },
  openapi: {
    path: '/swagger',
    title: 'Halide API',
    version: '1.0.0',
  },
  proxy: {
    maxFreeSockets: DEFAULT_MAX_FREE_SOCKETS,
    maxSockets: DEFAULT_MAX_SOCKETS,
    timeoutMs: DEFAULT_PROXY_TIMEOUT_MS,
  },
  rateLimit: {
    maxRequests: DEFAULT_RATE_LIMIT_MAX_REQUESTS,
    windowMs: DEFAULT_RATE_LIMIT_WINDOW_MS,
  },
  route: {
    method: 'get' as const,
  },
} as const;

/**
 * Default authorization function that permits any request with a valid JWT.
 *
 * This implements an "any authenticated user" policy — the JWT has already been
 * validated (signature, expiration, audience) by the time this function runs.
 * Routes with `access: 'private'` and no explicit `authorize` function accept
 * any holder of a valid token.
 *
 * To restrict access to specific roles or claims, provide an `authorize`
 * function on the route definition.
 */
export const defaultAuthorize: AuthorizeFn<unknown, unknown> = async (
  _ctx: RequestContext,
  _app: HalideContext,
) => true;

/**
 * Create a noop logger that discards all log messages.
 * @typeParam T - The type of the log scope (defaults to unknown).
 * @returns A {@link Logger} implementation where all methods are no-ops.
 */
export function createNoopLogger<T = unknown>(): Logger<T> {
  return {
    debug: (_overrides?: Partial<T>) => {},
    error: (_overrides?: Partial<T>) => {},
    info: (_overrides?: Partial<T>) => {},
    warn: (_overrides?: Partial<T>) => {},
  };
}

/**
 * Create a structured logger that outputs formatted plain text or compact JSON.
 * @typeParam T - The type of the log scope (defaults to unknown).
 * @param options - Optional configuration for the logger.
 * @param options.formatMessage - When true (default), outputs formatted plain text. When false, outputs compact JSON.
 * @returns A {@link Logger} implementation with structured output.
 */
const useColors = process.stdout.isTTY === true;

const LEVEL_STYLES: Record<string, Parameters<typeof styleText>[0]> = {
  DEBUG: ['gray', 'dim'],
  ERROR: 'red',
  INFO: 'cyan',
  WARN: 'yellow',
};

const formatLevel = (level: string): string =>
  useColors ? styleText(LEVEL_STYLES[level] ?? 'white', level) : level;

export function createDefaultLogger<T = unknown>(options?: { formatMessage?: boolean }): Logger<T> {
  const formatMessage = options?.formatMessage ?? true;
  const formatScope = (scope: Record<string, unknown>): string => {
    const pairs = Object.entries(scope).map(([k, v]) => `${k}=${JSON.stringify(v)}`);
    return pairs.length ? ` ${pairs.join(' ')}` : '';
  };
  const buildLog = (level: string, overrides?: Partial<T>): void => {
    const scope = overrides ?? ({} as Record<string, unknown>);
    if (!formatMessage) {
      // biome-ignore lint/suspicious/noConsole: styled logger must use console.log
      console.log(JSON.stringify({ level, scope }));
      return;
    }
    const body = formatScope(scope);
    const formatted = formatLevel(level);
    // biome-ignore lint/suspicious/noConsole: styled logger must use console.log
    console.log(`[${formatted}]${body}`);
  };
  return {
    debug: (overrides?: Partial<T>) => buildLog('DEBUG', overrides),
    error: (overrides?: Partial<T>) => buildLog('ERROR', overrides),
    info: (overrides?: Partial<T>) => buildLog('INFO', overrides),
    warn: (overrides?: Partial<T>) => buildLog('WARN', overrides),
  };
}

/**
 * Wrap a logger so every method automatically applies a fixed scope.
 *
 * Used by the framework to create per-request loggers: the `logScopeFactory`
 * produces a scope value for the current request, and `createScopedLogger`
 * bakes it into every log call so handlers and hooks don't need to pass
 * scope manually.
 *
 * Caller-provided overrides are merged with the baked-in scope (last-write-wins).
 *
 * @typeParam TLogScope - The type of the log scope object.
 * @param logger - The underlying logger implementation.
 * @param scope - The fixed scope value to merge with caller overrides.
 * @returns A new {@link Logger} that merges `scope` with caller-provided overrides.
 */
export function createScopedLogger<TLogScope>(
  logger: Logger<TLogScope>,
  scope: TLogScope,
): Logger<TLogScope> {
  return {
    debug: (overrides?: Partial<TLogScope>) => {
      logger.debug({ ...scope, ...overrides });
    },
    error: (overrides?: Partial<TLogScope>) => {
      logger.error({ ...scope, ...overrides });
    },
    info: (overrides?: Partial<TLogScope>) => {
      logger.info({ ...scope, ...overrides });
    },
    warn: (overrides?: Partial<TLogScope>) => {
      logger.warn({ ...scope, ...overrides });
    },
  };
}

/**
 * Wrap a typed logger as an internal logger for use in framework internals
 * where ad-hoc scope objects are logged (e.g., validation errors, startup warnings).
 *
 * The wrapper handles the type difference between `Partial<T>` and `Record<string, unknown>`.
 *
 * @typeParam T - The current type parameter of the logger.
 * @param logger - The logger to wrap.
 * @returns A new {@link InternalLogger} that delegates to the underlying logger.
 */
export function asInternalLogger<T>(logger: Logger<T>): InternalLogger {
  return {
    debug: (overrides?: Record<string, unknown>) => {
      logger.debug(overrides as Partial<T>);
    },
    error: (overrides?: Record<string, unknown>) => {
      logger.error(overrides as Partial<T>);
    },
    info: (overrides?: Record<string, unknown>) => {
      logger.info(overrides as Partial<T>);
    },
    warn: (overrides?: Record<string, unknown>) => {
      logger.warn(overrides as Partial<T>);
    },
  };
}
