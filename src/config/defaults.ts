import { contentSecurityPolicy } from 'helmet';

export const DEFAULTS = {
  cors: {
    credentials: false,
    methods: ['get', 'post', 'put', 'delete', 'patch'] as string[],
    origin: ['*'] as string[],
  },
  csp: {
    default: contentSecurityPolicy.getDefaultDirectives(),
  },
  openapi: {
    includeProxyRoutes: true,
    path: '/swagger',
    title: 'bSPA API',
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
  },
} as const;

export const defaultAuthorize = async () => true;
