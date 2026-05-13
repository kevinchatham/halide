import type { Route } from '../types/api';
import type { AppConfig } from '../types/app';
import type { CspOptions } from '../types/csp';
import type { CorsConfig, SecurityConfig } from '../types/security';
import { serverConfigSchema } from './schema.js';

/** A single validation error with field location and message. */
export type ValidationError = {
  /** Dot-notation path to the offending field. */
  field: string;
  /** Human-readable error description. */
  message: string;
};

/** Result of validation with collected errors and warnings. */
export type ValidationResult = {
  /** List of accumulated validation errors. Empty when `valid` is true. */
  errors: ValidationError[];
  /** Whether validation passed (no errors). */
  valid: boolean;
  /** Non-blocking warnings about config choices. */
  warnings?: ValidationError[];
};

/** Input type for route validation. Partial API or proxy route. */
type RouteInput<TApp = unknown> =
  | Partial<Extract<Route<TApp>, { type: 'api' }>>
  | Partial<Extract<Route<TApp>, { type: 'proxy' }>>;

/** Input type for app config validation. Partial AppConfig. */
type AppInput = Partial<AppConfig>;

/** Input type for CORS config validation. Partial CorsConfig. */
type CorsInput = Partial<CorsConfig>;

/** Input type for auth config validation. Partial SecurityAuthConfig. */
type AuthInput = Partial<NonNullable<SecurityConfig['auth']>>;

/** Input type for security config validation. Partial security fields. */
type SecurityInput = {
  cors?: CorsInput;
  csp?: CspOptions;
  auth?: AuthInput;
  rateLimit?: { windowMs?: number; maxRequests?: number; maxEntries?: number };
};

/** Input type for server config validation. Partial server config fields. */
type ServerConfigInput<TApp = unknown> = {
  app?: AppInput;
  apiRoutes?: RouteInput<TApp>[];
  proxyRoutes?: RouteInput<TApp>[];
  observability?: unknown;
  security?: SecurityInput;
};

/** Validate the app configuration, checking port range and other app-level constraints. */
function validateAppConfig(app?: AppInput): ValidationResult {
  const errors: ValidationError[] = [];
  if (app?.port !== undefined) {
    if (!Number.isInteger(app.port) || app.port < 1 || app.port > 65535) {
      errors.push({
        field: 'app.port',
        message: 'app.port must be an integer between 1 and 65535',
      });
    }
  }
  return { errors, valid: errors.length === 0 };
}

/** Validate proxy route fields: target URL must be valid, at least one method required, proxyPath must start with /. */
function validateProxyRoute<TApp = unknown>(
  route: Partial<Extract<Route<TApp>, { type: 'proxy' }>>,
  errors: ValidationError[],
): void {
  if (route.target == null || route.target === '') {
    errors.push({ field: 'route.target', message: 'Proxy route requires target' });
  } else {
    try {
      const u = new URL(route.target);
      if (!['http:', 'https:'].includes(u.protocol)) {
        errors.push({
          field: 'route.target',
          message: `Proxy route target is not a valid URL: ${route.target}`,
        });
      }
    } catch {
      errors.push({
        field: 'route.target',
        message: `Proxy route target is not a valid URL: ${route.target}`,
      });
    }
  }
  if (!route.methods || route.methods.length === 0) {
    errors.push({ field: 'route.methods', message: 'Proxy route requires at least one method' });
  }
  if (route.proxyPath && !route.proxyPath.startsWith('/')) {
    errors.push({
      field: 'route.proxyPath',
      message: `Proxy route proxyPath must start with /: ${route.proxyPath}`,
    });
  }
}

/** Validate a single route configuration, checking path, handler, and proxy requirements. */
function validateRoute<TApp = unknown>(route: RouteInput<TApp>): ValidationResult {
  const errors: ValidationError[] = [];

  // Determine route type (missing type = api, matching existing behavior)
  const routeType = route.type ?? 'api';

  if (!route.path?.startsWith('/')) {
    errors.push({
      field: 'route.path',
      message: `Route path must start with / (${routeType}): ${route.path}`,
    });
  }

  const isApiRoute = routeType === 'api';
  if (isApiRoute && !('handler' in route)) {
    errors.push({ field: 'route.handler', message: 'API route requires handler' });
  }

  if (routeType === 'proxy') {
    validateProxyRoute(route as Partial<Extract<Route<TApp>, { type: 'proxy' }>>, errors);
  }

  return { errors, valid: errors.length === 0 };
}

/** Validate an array of routes by calling `validateRoute` on each entry and collecting errors. */
function validateRoutes<TApp = unknown>(routes?: RouteInput<TApp>[]): ValidationResult {
  const errors: ValidationError[] = [];
  if (!routes) return { errors, valid: true };
  for (const route of routes) {
    const result = validateRoute(route);
    errors.push(...result.errors);
  }
  return { errors, valid: errors.length === 0 };
}

/** Validate that auth config is present when any route requires `access: 'private'`. */
function validateSecurityForRoutes<TApp = unknown>(
  routes?: RouteInput<TApp>[],
  security?: SecurityInput,
): ValidationResult {
  const errors: ValidationError[] = [];
  const hasPrivateRoute = routes?.some((r) => r.access === 'private');
  if (hasPrivateRoute && !security?.auth) {
    errors.push({
      field: 'security.auth',
      message: "security.auth is required when routes have access: 'private'",
    });
  }
  return { errors, valid: errors.length === 0 };
}

/** Validate CORS config, rejecting wildcard origin (`*`) combined with credentials: true. */
function validateCors(cors?: CorsInput): ValidationResult {
  const errors: ValidationError[] = [];
  if (!cors?.credentials) return { errors, valid: true };

  const origin = cors.origin;
  const isWildcard = origin === '*' || (Array.isArray(origin) && origin.includes('*'));
  if (isWildcard) {
    errors.push({
      field: 'cors.origin',
      message: 'Wildcard origin cannot be used with credentials: true',
    });
  }
  return { errors, valid: errors.length === 0 };
}

/** Validate auth config, checking strategy-specific requirements and secretTtl range. */
function validateAuth(auth?: AuthInput): ValidationResult {
  const errors: ValidationError[] = [];

  if (auth?.strategy === 'bearer') {
    // Check secret is not an empty string
    if (typeof auth.secret === 'string' && auth.secret === '') {
      errors.push({
        field: 'auth.secret',
        message: 'auth.secret must not be empty for bearer strategy',
      });
    }
    // Check secret is present (function or non-empty string)
    else if (!auth.secret) {
      errors.push({
        field: 'auth.secret',
        message: 'auth.secret is required when strategy is bearer',
      });
    }
    // Check function-based secret is not returning empty string
    else if (typeof auth.secret === 'function') {
      const secretValue = auth.secret();
      if (secretValue instanceof Promise) {
        secretValue.catch(() => {
          // Async secret rejection — handled by validateAuthSecret
        });
      } else if (typeof secretValue === 'string' && secretValue === '') {
        errors.push({
          field: 'auth.secret',
          message: 'auth.secret must not be empty for bearer strategy',
        });
      }
    }
  }

  if (auth?.strategy === 'jwks' && !auth.jwksUri) {
    errors.push({
      field: 'auth.jwksUri',
      message: 'auth.jwksUri is required when strategy is jwks',
    });
  }

  if (auth?.secretTtl !== undefined) {
    if (!Number.isInteger(auth.secretTtl) || auth.secretTtl < 0) {
      errors.push({
        field: 'auth.secretTtl',
        message: 'auth.secretTtl must be a non-negative integer (seconds)',
      });
    }
  }

  if (auth?.algorithms !== undefined) {
    if (!Array.isArray(auth.algorithms) || auth.algorithms.length === 0) {
      errors.push({
        field: 'auth.algorithms',
        message: 'auth.algorithms must be a non-empty array of strings',
      });
    }
  }

  const warnings: ValidationError[] = [];
  if (auth?.algorithms !== undefined && auth.strategy === 'jwks') {
    warnings.push({
      field: 'auth.algorithms',
      message:
        'auth.algorithms is ignored when strategy is jwks (algorithm is resolved from JWKS endpoint)',
    });
  }

  return { errors, valid: errors.length === 0, warnings };
}

/** Validate an async auth secret by calling it and checking the resolved value. */
export async function validateAuthSecret(auth?: AuthInput): Promise<ValidationResult> {
  const errors: ValidationError[] = [];

  if (auth?.strategy === 'bearer' && auth.secret && typeof auth.secret === 'function') {
    const secretValue = auth.secret();
    if (secretValue instanceof Promise) {
      try {
        const resolved = await secretValue;
        if (typeof resolved === 'string' && resolved === '') {
          errors.push({
            field: 'auth.secret',
            message: 'auth.secret must not be empty for bearer strategy',
          });
        }
      } catch {
        // Promise rejection — will be caught at the entry point
      }
    }
  }

  return { errors, valid: errors.length === 0 };
}

/** Validate rate limit config, checking that maxEntries is a positive integer when provided. */
function validateRateLimit(rateLimit?: {
  windowMs?: number;
  maxRequests?: number;
  maxEntries?: number;
}): ValidationResult {
  const errors: ValidationError[] = [];
  if (!rateLimit) return { errors, valid: true };
  if (rateLimit.maxEntries !== undefined) {
    if (!Number.isInteger(rateLimit.maxEntries) || rateLimit.maxEntries < 1) {
      errors.push({
        field: 'security.rateLimit.maxEntries',
        message: 'rateLimit.maxEntries must be a positive integer',
      });
    }
  }
  return { errors, valid: errors.length === 0 };
}

/** Validate CSP directives use camelCase naming (reject kebab-case like `default-src`). */
function validateCspDirectives(csp?: CspOptions): ValidationResult {
  const errors: ValidationError[] = [];
  if (!csp?.directives) return { errors, valid: true };
  const kebabPattern = /^[a-z]+-[a-z]/;
  for (const key of Object.keys(csp.directives)) {
    if (kebabPattern.test(key)) {
      errors.push({
        field: 'csp.directives',
        message: `CSP directive '${key}' uses kebab-case. Use camelCase instead (e.g., 'defaultSrc' not 'default-src').`,
      });
    }
  }
  return { errors, valid: errors.length === 0 };
}

/**
 * Synchronously validate a server configuration object.
 * Uses Zod schemas for type-safe validation, then applies custom cross-field
 * validation rules that Zod cannot express.
 * @typeParam TApp - The bundled app context type combining claims and logger.
 * @param config - The server configuration to validate.
 * @throws {Error} When validation fails with a message listing all errors.
 */
export function validateServerConfigSync<TApp = unknown>(config: ServerConfigInput<TApp>): void {
  // Use Zod for structural validation of each section
  const serverResult = serverConfigSchema.safeParse(config);
  const zodErrors: ValidationError[] = serverResult.success
    ? []
    : serverResult.error.issues.map((issue) => ({
        field: issue.path.join('.') || 'unknown',
        message: issue.message,
      }));

  // Collect custom validation results (errors and warnings)
  const results: ValidationResult[] = [
    ...(zodErrors.length > 0 ? [{ errors: zodErrors, valid: false }] : []),
    validateAppConfig(config.app),
    ...validateRoutes(config.apiRoutes).errors.map((e) => ({ errors: [e], valid: false })),
    ...validateRoutes(config.proxyRoutes).errors.map((e) => ({ errors: [e], valid: false })),
    ...validateSecurityForRoutes(
      [...(config.apiRoutes ?? []), ...(config.proxyRoutes ?? [])],
      config.security,
    ).errors.map((e) => ({ errors: [e], valid: false })),
    ...validateCors(config.security?.cors).errors.map((e) => ({ errors: [e], valid: false })),
    validateAuth(config.security?.auth),
    ...validateRateLimit(config.security?.rateLimit).errors.map((e) => ({
      errors: [e],
      valid: false,
    })),
    ...validateCspDirectives(config.security?.csp).errors.map((e) => ({
      errors: [e],
      valid: false,
    })),
  ];

  const allErrors = results.flatMap((r) => r.errors);
  const allWarnings = results.flatMap((r) => r.warnings ?? []);
  if (allErrors.length > 0) {
    throw new Error(
      'Configuration validation failed:\n' +
        allErrors.map((e) => `  - ${e.field}: ${e.message}`).join('\n'),
    );
  }
  if (allWarnings.length > 0) {
    for (const w of allWarnings) {
      // biome-ignore lint/suspicious/noConsole: config warnings logged to stderr
      console.warn(`[Halide] ${w.field}: ${w.message}`);
    }
  }
}

/**
 * Validate a server configuration object.
 * Uses Zod schemas for type-safe validation, then applies custom cross-field
 * validation rules that Zod cannot express. Returns a ValidationResult instead
 * of throwing, allowing callers to handle validation errors programmatically.
 * @typeParam TApp - The bundled app context type combining claims and logger.
 * @param config - The server configuration to validate.
 * @returns A `ValidationResult` with any errors and warnings.
 */
export async function validateServerConfig<TApp = unknown>(
  config: ServerConfigInput<TApp>,
): Promise<ValidationResult> {
  // Use Zod for structural validation of each section
  const serverResult = serverConfigSchema.safeParse(config);
  const zodErrors: ValidationError[] = serverResult.success
    ? []
    : serverResult.error.issues.map((issue) => ({
        field: issue.path.join('.') || 'unknown',
        message: issue.message,
      }));

  // Collect custom validation results (errors and warnings)
  const results: ValidationResult[] = [
    ...(zodErrors.length > 0 ? [{ errors: zodErrors, valid: false }] : []),
    validateAppConfig(config.app),
    ...validateRoutes(config.apiRoutes).errors.map((e) => ({ errors: [e], valid: false })),
    ...validateRoutes(config.proxyRoutes).errors.map((e) => ({ errors: [e], valid: false })),
    ...validateSecurityForRoutes(
      [...(config.apiRoutes ?? []), ...(config.proxyRoutes ?? [])],
      config.security,
    ).errors.map((e) => ({ errors: [e], valid: false })),
    ...validateCors(config.security?.cors).errors.map((e) => ({ errors: [e], valid: false })),
    validateAuth(config.security?.auth),
    ...validateRateLimit(config.security?.rateLimit).errors.map((e) => ({
      errors: [e],
      valid: false,
    })),
    ...validateCspDirectives(config.security?.csp).errors.map((e) => ({
      errors: [e],
      valid: false,
    })),
  ];

  // Run async auth secret validation
  const asyncResult = await validateAuthSecret(config.security?.auth);
  results.push(asyncResult);

  const allErrors = results.flatMap((r) => r.errors);
  const allWarnings = results.flatMap((r) => r.warnings ?? []);
  return {
    errors: allErrors,
    valid: allErrors.length === 0,
    warnings: allWarnings,
  };
}
