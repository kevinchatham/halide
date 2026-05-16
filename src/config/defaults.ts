import { styleText } from 'node:util';
import type { AuthorizeFn } from '../types/api';
import type { HalideContext, InternalLogger, Logger, RequestContext } from '../types/app';
import type { CspDirectives } from '../types/csp';

/**
 * Default configuration values used when options are omitted.
 * These are applied during server creation in `createApp` and `createServer`.
 */
export const DEFAULTS = {
  app: {
    apiPrefix: '/api',
    fallback: 'index.html',
    name: 'app',
    port: 3553,
  },
  auth: {
    secretTtl: 60,
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
    maxFreeSockets: 10,
    maxSockets: 50,
    timeoutMs: 10_000,
  },
  rateLimit: {
    maxRequests: 100,
    windowMs: 900_000,
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
    debug: (_scope: T) => {},
    error: (_scope: T) => {},
    info: (_scope: T) => {},
    warn: (_scope: T) => {},
  };
}

/**
 * Create a styled logger that outputs colored, level-prefixed messages.
 * @typeParam T - The type of the log scope (defaults to unknown).
 * @returns A {@link Logger} implementation with styled output.
 */
export function createDefaultLogger<T = unknown>(): Logger<T> {
  const useColors = process.stdout.isTTY === true;
  const format = (styles: Parameters<typeof styleText>[0], msg: string): string =>
    useColors ? styleText(styles, msg) : msg;
  const stringifyScope = (scope: unknown): string => {
    if (!scope || typeof scope !== 'object') return '';
    try {
      return ` [${JSON.stringify(scope)}]`;
    } catch {
      return '';
    }
  };
  return {
    debug: (scope: T, ...args: unknown[]) => {
      const scopeStr = stringifyScope(scope);
      const msg = `[DEBUG]${scopeStr} ${args.map(String).join(' ')}`;
      // biome-ignore lint/suspicious/noConsole: styled logger must use console.log
      console.log(format(['gray', 'bold'], msg));
    },
    error: (scope: T, ...args: unknown[]) => {
      const scopeStr = stringifyScope(scope);
      const msg = `[ERROR]${scopeStr} ${args.map(String).join(' ')}`;
      // biome-ignore lint/suspicious/noConsole: styled logger must use console.log
      console.log(format(['red', 'bold'], msg));
    },
    info: (scope: T, ...args: unknown[]) => {
      const scopeStr = stringifyScope(scope);
      const msg = `[INFO]${scopeStr} ${args.map(String).join(' ')}`;
      // biome-ignore lint/suspicious/noConsole: styled logger must use console.log
      console.log(format(['cyan', 'bold'], msg));
    },
    warn: (scope: T, ...args: unknown[]) => {
      const scopeStr = stringifyScope(scope);
      const msg = `[WARN]${scopeStr} ${args.map(String).join(' ')}`;
      // biome-ignore lint/suspicious/noConsole: styled logger must use console.log
      console.log(format(['yellow', 'bold'], msg));
    },
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
 * @typeParam TLogScope - The type of the log scope object.
 * @param logger - The underlying logger implementation.
 * @param scope - The fixed scope value to pass as the first argument.
 * @returns A new {@link Logger} that pre-applies `scope` to every method.
 */
export function createScopedLogger<TLogScope>(
  logger: Logger<TLogScope>,
  scope: TLogScope,
): Logger<TLogScope> {
  return {
    debug: (_scope: TLogScope, ...args: unknown[]) => logger.debug(scope, ...args),
    error: (_scope: TLogScope, ...args: unknown[]) => logger.error(scope, ...args),
    info: (_scope: TLogScope, ...args: unknown[]) => logger.info(scope, ...args),
    warn: (_scope: TLogScope, ...args: unknown[]) => logger.warn(scope, ...args),
  };
}

/**
 * Cast a typed logger to an internal logger for use in framework internals
 * where ad-hoc scope objects are logged (e.g., validation errors, startup warnings).
 *
 * The cast is safe because the underlying logger implementation (e.g., `createDefaultLogger`)
 * accepts any value via `stringifyScope(scope)` which operates on `unknown`.
 *
 * @typeParam T - The current type parameter of the logger.
 * @param logger - The logger to cast.
 * @returns The logger cast to {@link InternalLogger}.
 */
export function asInternalLogger<T>(logger: Logger<T>): InternalLogger {
  return logger as InternalLogger;
}
