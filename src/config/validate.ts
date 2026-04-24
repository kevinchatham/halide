import type { CorsConfig, CspOptions, Route, SecurityConfig, SpaConfig } from '../types';

type RouteInput<TClaims = unknown> =
  | Partial<Extract<Route<TClaims>, { type: 'api' }>>
  | Partial<Extract<Route<TClaims>, { type: 'proxy' }>>;
type SpaInput = Partial<SpaConfig>;
type CorsInput = Partial<CorsConfig>;
type AuthInput = Partial<NonNullable<SecurityConfig['auth']>>;
type SecurityInput = {
  cors?: CorsInput;
  csp?: CspOptions;
  auth?: AuthInput;
  rateLimit?: { windowMs?: number; maxRequests?: number };
};
type ServerConfigInput<TClaims = unknown> = {
  spa?: SpaInput;
  apiRoutes?: RouteInput<TClaims>[];
  proxyRoutes?: RouteInput<TClaims>[];
  observability?: unknown;
  security?: SecurityInput;
};

function validateSpaConfig(spa?: SpaInput): void {
  if (!spa?.root) {
    throw new Error('spa.root is required');
  }
  if (spa.port !== undefined) {
    if (!Number.isInteger(spa.port) || spa.port < 1 || spa.port > 65535) {
      throw new Error('spa.port must be an integer between 1 and 65535');
    }
  }
}

function validateRoute<TClaims = unknown>(route: RouteInput<TClaims>): void {
  if (!route.path?.startsWith('/')) {
    throw new Error(`Route path must start with / (${route.type ?? 'api'}): ${route.path}`);
  }
  const isApiRoute = route.type === 'api' || route.type === undefined;
  if (isApiRoute && !('handler' in route)) {
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

function validateRoutes<TClaims = unknown>(routes?: RouteInput<TClaims>[]): void {
  if (!routes) return;
  for (const route of routes) {
    validateRoute(route);
  }
}

function validateSecurityForRoutes<TClaims = unknown>(
  routes?: RouteInput<TClaims>[],
  security?: SecurityInput,
): void {
  const hasPrivateRoute = routes?.some((r) => r.access === 'private');
  if (hasPrivateRoute && !security?.auth) {
    throw new Error("security.auth is required when routes have access: 'private'");
  }
}

function validateCors(cors?: CorsInput): void {
  if (!cors?.credentials) return;
  if (cors.origin === '*' || (Array.isArray(cors.origin) && cors.origin.includes('*'))) {
    throw new Error('Wildcard origin cannot be used with credentials: true');
  }
}

function validateAuth(auth?: AuthInput): void {
  if (auth?.strategy === 'bearer' && !auth.secret) {
    throw new Error('auth.secret is required when strategy is bearer');
  }
  if (auth?.strategy === 'jwks' && !auth.jwksUri) {
    throw new Error('auth.jwksUri is required when strategy is jwks');
  }
  if (auth?.secretTtl !== undefined) {
    if (!Number.isInteger(auth.secretTtl) || auth.secretTtl < 0) {
      throw new Error('auth.secretTtl must be a non-negative integer (seconds)');
    }
  }
}

function validateCspDirectives(csp?: CspOptions): void {
  if (!csp?.directives) return;
  const kebabPattern = /^[a-z]+-[a-z]/;
  for (const key of Object.keys(csp.directives)) {
    if (kebabPattern.test(key)) {
      throw new Error(
        `CSP directive '${key}' uses kebab-case. Use camelCase instead (e.g., 'defaultSrc' not 'default-src').`,
      );
    }
  }
}

export function validateServerConfig<TClaims = unknown>(config: ServerConfigInput<TClaims>): void {
  validateSpaConfig(config.spa);
  validateRoutes(config.apiRoutes);
  validateRoutes(config.proxyRoutes);
  validateSecurityForRoutes(
    [...(config.apiRoutes ?? []), ...(config.proxyRoutes ?? [])],
    config.security,
  );
  validateCors(config.security?.cors);
  validateAuth(config.security?.auth);
  validateCspDirectives(config.security?.csp);
}
