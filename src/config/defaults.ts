import type { Logger } from '../types';

export const DEFAULTS = {
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
      styleSrc: ["'self'", 'https:', "'unsafe-inline'"],
      upgradeInsecureRequests: [],
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
  spa: {
    apiPrefix: '/api',
    fallback: 'index.html',
    name: 'app',
    port: 3553,
  },
} as const;

export const defaultAuthorize = async (): Promise<boolean> => true;

export function createNoopLogger(): Logger {
  return {
    debug: (..._args) => {},
    error: (..._args) => {},
    info: (..._args) => {},
    warn: (..._args) => {},
  };
}
