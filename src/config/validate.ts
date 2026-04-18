type ApiRouteInput = {
  type?: 'api';
  path?: string;
  access?: 'public' | 'private';
  method?: 'get' | 'post' | 'put' | 'patch' | 'delete';
  handler?: (ctx: any, claims: any) => Promise<unknown>;
  authorize?: (ctx: any, claims: any) => boolean | Promise<boolean>;
  observe?: boolean;
  target?: undefined;
  methods?: undefined;
  proxyPath?: undefined;
  identity?: undefined;
  transform?: undefined;
  retries?: undefined;
  timeout?: undefined;
};

type ProxyRouteInput = {
  type?: 'proxy';
  path?: string;
  access?: 'public' | 'private';
  methods?: Array<'get' | 'post' | 'put' | 'patch' | 'delete'>;
  target?: string;
  proxyPath?: string;
  identity?: (ctx: any, claims: any) => Record<string, string> | undefined;
  authorize?: (ctx: any, claims: any) => boolean | Promise<boolean>;
  transform?: (response: { body: unknown; headers: Record<string, string> }) =>
    | { body: unknown; headers: Record<string, string> }
    | Promise<{ body: unknown; headers: Record<string, string> }>;
  retries?: { attempts?: number; backoff?: 'exponential' | 'linear' | 'fixed' };
  timeout?: number;
  observe?: boolean;
  handler?: undefined;
};

type RouteInput = ApiRouteInput | ProxyRouteInput;

type SpaInput = {
  name?: string;
  root?: string;
  fallback?: string;
};

type CorsInput = {
  origin?: string | string[];
  methods?: Array<'get' | 'post' | 'put' | 'delete' | 'patch' | 'head' | 'options'>;
  allowedHeaders?: string[];
  exposedHeaders?: string[];
  credentials?: boolean;
  maxAge?: number;
};

type AuthInput = {
  strategy?: 'bearer' | 'jwks';
  secret?: () => string | Promise<string>;
  jwksUri?: string;
  audience?: string;
};

type SecurityInput = {
  cors?: CorsInput;
  csp?: Record<string, string[]>;
  auth?: AuthInput;
  rateLimit?: { windowMs?: number; maxRequests?: number };
};

type ObservabilityInput = {
  onRequest?: (ctx: any, claims: any) => void | Promise<void>;
  onResponse?: (ctx: any, claims: any, response: any) => void | Promise<void>;
};

type ServerConfigInput = {
  spa?: SpaInput;
  routes?: RouteInput[];
  observability?: ObservabilityInput;
  security?: SecurityInput;
};

export function validateServerConfig(config: ServerConfigInput): void {
  if (!config.spa?.root) {
    throw new Error('spa.root is required');
  }

  if (config.routes) {
    for (const route of config.routes) {
      if (!route.path?.startsWith('/')) {
        throw new Error(`Route path must start with /: ${route.path}`);
      }
      const isApiRoute = route.type === 'api' || route.type === undefined;
      if (isApiRoute && !route.handler) {
        throw new Error('API route requires handler');
      }
      if (route.type === 'proxy') {
        if (!route.target) {
          throw new Error('Proxy route requires target');
        }
        if (!route.methods || route.methods.length === 0) {
          throw new Error('Proxy route requires at least one method');
        }
        if (route.proxyPath && !route.proxyPath.startsWith('/')) {
          throw new Error(`Proxy route proxyPath must start with /: ${route.proxyPath}`);
        }
      }
    }
  }

  const hasPrivateRoute = config.routes?.some((r) => r.access === 'private');
  if (hasPrivateRoute && !config.security?.auth) {
    throw new Error("security.auth is required when routes have access: 'private'");
  }

  const cors = config.security?.cors;
  if (cors?.credentials) {
    if (cors.origin === '*' || (Array.isArray(cors.origin) && cors.origin.includes('*'))) {
      throw new Error('Wildcard origin cannot be used with credentials: true');
    }
  }

  const auth = config.security?.auth;
  if (auth?.strategy === 'bearer' && !auth.secret) {
    throw new Error('auth.secret is required when strategy is bearer');
  }
  if (auth?.strategy === 'jwks' && !auth.jwksUri) {
    throw new Error('auth.jwksUri is required when strategy is jwks');
  }
}
