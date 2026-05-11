import { styleText } from 'node:util';
import type { AuthorizeFn } from '../types/api';
import type { Logger, RequestContext } from '../types/app';

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
    origin: ['*'] as string[],
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
      styleSrc: ["'self'", 'https:'],
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
    },
  },
  openapi: {
    path: '/swagger',
    title: 'Halide API',
    version: '1.0.0',
  },
  proxy: {
    timeoutMs: 60_000,
  },
  rateLimit: {
    maxRequests: 100,
    windowMs: 900_000,
  },
  route: {
    method: 'get' as const,
  },
} as const;

/** Default authorization function that allows all requests. */
export const defaultAuthorize: AuthorizeFn<unknown> = async (_ctx: RequestContext, _app: unknown) =>
  true;

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
