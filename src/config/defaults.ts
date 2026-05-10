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
      scriptSrc: ["'self'", 'https://cdn.jsdelivr.net'],
      scriptSrcAttr: ["'none'"],
      styleSrc: ["'self'", 'https:'],
      styleSrcAttr: ["'none'"],
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
