import { contentSecurityPolicy } from 'helmet';

export const DEFAULTS = {
  spa: {
    fallback: 'index.html',
    name: 'app',
  },
  cors: {
    methods: ['get', 'post', 'put', 'delete', 'patch'] as string[],
    origin: ['*'] as string[],
    credentials: false,
  },
  rateLimit: {
    windowMs: 900_000,
    maxRequests: 100,
  },
  csp: {
    default: contentSecurityPolicy.getDefaultDirectives(),
  },
  openapi: {
    path: '/swagger',
    title: 'bSPA API',
    version: '1.0.0',
    includeProxyRoutes: true,
  },
  proxy: {
    timeoutMs: 60_000,
  },
  route: {
    method: 'get' as const,
  },
} as const;

export const defaultAuthorize = async () => true;
