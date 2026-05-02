import type { AppConfig, CorsConfig, CspOptions, Route, SecurityConfig } from '../types';

/** Input type for route validation. */
type RouteInput<TApp = unknown> =
  | Partial<Extract<Route<TApp>, { type: 'api' }>>
  | Partial<Extract<Route<TApp>, { type: 'proxy' }>>;

/** Input type for app config validation. */
type AppInput = Partial<AppConfig>;

/** Input type for CORS config validation. */
type CorsInput = Partial<CorsConfig>;

/** Input type for auth config validation. */
type AuthInput = Partial<NonNullable<SecurityConfig['auth']>>;

/** Input type for security config validation. */
type SecurityInput = {
  cors?: CorsInput;
  csp?: CspOptions;
  auth?: AuthInput;
  rateLimit?: { windowMs?: number; maxRequests?: number };
};

/** Input type for server config validation. */
type ServerConfigInput<TApp = unknown> = {
  app?: AppInput;
  apiRoutes?: RouteInput<TApp>[];
  proxyRoutes?: RouteInput<TApp>[];
  observability?: unknown;
  security?: SecurityInput;
};

/** Validate that app config is valid (only validates port if app is provided). */
function validateAppConfig(app?: AppInput): void {
  if (app?.port !== undefined) {
    if (!Number.isInteger(app.port) || app.port < 1 || app.port > 65535) {
      throw new Error('app.port must be an integer between 1 and 65535');
    }
  }
}

/** Validate a single route configuration. */
function validateRoute<TApp = unknown>(route: RouteInput<TApp>): void {
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

/** Validate an array of routes. */
function validateRoutes<TApp = unknown>(routes?: RouteInput<TApp>[]): void {
  if (!routes) return;
  for (const route of routes) {
    validateRoute(route);
  }
}

/** Validate that auth config exists if any routes require authentication. */
function validateSecurityForRoutes<TApp = unknown>(
  routes?: RouteInput<TApp>[],
  security?: SecurityInput,
): void {
  const hasPrivateRoute = routes?.some((r) => r.access === 'private');
  if (hasPrivateRoute && !security?.auth) {
    throw new Error("security.auth is required when routes have access: 'private'");
  }
}

/** Validate CORS configuration (wildcard origin cannot be used with credentials). */
function validateCors(cors?: CorsInput): void {
  if (!cors?.credentials) return;
  if (cors.origin === '*' || (Array.isArray(cors.origin) && cors.origin.includes('*'))) {
    throw new Error('Wildcard origin cannot be used with credentials: true');
  }
}

/** Validate authentication configuration. */
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

/** Validate CSP directives (must use camelCase, not kebab-case). */
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

/**
 * Validate a server configuration object.
 * Throws descriptive errors for invalid configurations.
 * @typeParam TApp - The bundled app context type combining claims and logger.
 * @param config - The server configuration to validate.
 */
export function validateServerConfig<TApp = unknown>(config: ServerConfigInput<TApp>): void {
  validateAppConfig(config.app);
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
