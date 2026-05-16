import { z } from 'zod';

import { MAX_COLLECT_BYTES } from './constants';

/**
 * Zod schema for app config structural validation.
 *
 * Validates `apiPrefix`, `fallback`, `name`, `port`, and `root` fields.
 * Ensures `port` is an integer between 1 and 65535.
 */
export const appSchema = z
  .object({
    apiPrefix: z.string().optional(),
    fallback: z.string().optional(),
    name: z.string().optional(),
    port: z.number().optional(),
    root: z.string().optional(),
  })
  .strict()
  .refine(
    (data) => {
      if (data.port === undefined) return true;
      return Number.isInteger(data.port) && data.port >= 1 && data.port <= 65535;
    },
    {
      message: 'app.port must be an integer between 1 and 65535',
      path: ['port'],
    },
  );

/**
 * Zod schema for CORS config — validates wildcard origin + credentials conflict.
 *
 * Ensures that `credentials: true` is not used with a wildcard (`*`) origin.
 */
export const corsSchema = z
  .object({
    allowedHeaders: z.array(z.string()).optional(),
    credentials: z.boolean().optional(),
    exposedHeaders: z.array(z.string()).optional(),
    maxAge: z.number().optional(),
    methods: z.array(z.string()).optional(),
    origin: z.union([z.string(), z.array(z.string())]).optional(),
  })
  .strict()
  .refine(
    (data) => {
      if (!data.credentials) return true;
      const origin = data.origin;
      const isWildcard = origin === '*' || (Array.isArray(origin) && origin.includes('*'));
      return !isWildcard;
    },
    {
      message: 'Wildcard origin cannot be used with credentials: true',
      path: ['origin'],
    },
  );

/**
 * Zod schema for CSP directives — strict camelCase directive keys only.
 *
 * Validates all CSP directive fields as optional string arrays. Uses `.strict()`
 * to reject unknown keys (kebab-case directives are rejected).
 */
export const cspSchema = z
  .object({
    baseUri: z.array(z.string()).optional(),
    childSrc: z.array(z.string()).optional(),
    connectSrc: z.array(z.string()).optional(),
    defaultSrc: z.array(z.string()).optional(),
    fontSrc: z.array(z.string()).optional(),
    formAction: z.array(z.string()).optional(),
    frameAncestors: z.array(z.string()).optional(),
    frameSrc: z.array(z.string()).optional(),
    imgSrc: z.array(z.string()).optional(),
    manifestSrc: z.array(z.string()).optional(),
    mediaSrc: z.array(z.string()).optional(),
    objectSrc: z.array(z.string()).optional(),
    sandbox: z.array(z.string()).optional(),
    scriptSrc: z.array(z.string()).optional(),
    scriptSrcAttr: z.array(z.string()).optional(),
    scriptSrcElem: z.array(z.string()).optional(),
    styleSrc: z.array(z.string()).optional(),
    styleSrcAttr: z.array(z.string()).optional(),
    styleSrcElem: z.array(z.string()).optional(),
    upgradeInsecureRequests: z.array(z.string()).optional(),
    workerSrc: z.array(z.string()).optional(),
  })
  .strict()
  .optional();

/**
 * Zod schema for bearer authentication config.
 *
 * Validates `secret` (required, non-empty string or function), `secretTtl`
 * (non-negative integer), `algorithms` (non-empty array), and `audience`
 * (optional string). Uses `.superRefine()` to reject empty secrets.
 */
const bearerAuthSchema = z
  .object({
    algorithms: z.array(z.string()).optional(),
    audience: z.string().optional(),
    secret: z.union([z.string(), z.function()]),
    secretTtl: z.number().optional(),
    strategy: z.literal('bearer').optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (typeof data.secret === 'string' && data.secret === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'auth.secret must not be empty for bearer strategy',
        path: ['secret'],
      });
    }
  })
  .refine(
    (data) => {
      if (data.secretTtl === undefined) return true;
      return Number.isInteger(data.secretTtl) && data.secretTtl >= 0;
    },
    {
      message: 'auth.secretTtl must be a non-negative integer (seconds)',
      path: ['secretTtl'],
    },
  )
  .refine(
    (data) => {
      if (data.algorithms === undefined) return true;
      return Array.isArray(data.algorithms) && data.algorithms.length > 0;
    },
    {
      message: 'auth.algorithms must be a non-empty array of strings',
      path: ['algorithms'],
    },
  );

/**
 * Zod schema for JWKS authentication config.
 *
 * Validates `jwksUri` (required string), `algorithms` (non-empty array),
 * and `audience` (optional string). Strategy is locked to `'jwks'`.
 */
const jwksAuthSchema = z
  .object({
    algorithms: z.array(z.string()).optional(),
    audience: z.string().optional(),
    jwksUri: z.string(),
    strategy: z.literal('jwks'),
  })
  .strict()
  .refine(
    (data) => {
      if (data.algorithms === undefined) return true;
      return Array.isArray(data.algorithms) && data.algorithms.length > 0;
    },
    {
      message: 'auth.algorithms must be a non-empty array of strings',
      path: ['algorithms'],
    },
  );

/**
 * Zod schema for auth config — validates bearer (with `secret`) or jwks (with `jwksUri`) strategy.
 *
 * Uses `.union()` to accept either bearer or jwks auth config. Both are optional
 * at the top level (auth is nested under `security.auth`).
 */
export const authSchema = z.union([bearerAuthSchema, jwksAuthSchema]).optional();

/**
 * Zod schema for API route structural validation.
 *
 * Validates `access`, `handler`, `method`, `observe`, `path`, and `type` fields.
 * Ensures `path` starts with `/`.
 */
export const apiRouteSchema = z
  .object({
    access: z.enum(['public', 'private']).optional(),
    handler: z.function().optional(),
    method: z.enum(['get', 'post', 'put', 'patch', 'delete', 'head', 'options']).optional(),
    observe: z.boolean().optional(),
    path: z.string().optional(),
    type: z.literal('api').optional(),
  })
  .refine(
    (data) => {
      if (data.path === undefined) return true;
      return data.path.startsWith('/');
    },
    (data) => ({
      message: `Route path must start with / (api): ${data.path}`,
      path: ['path'],
    }),
  );

/**
 * Zod schema for proxy route structural validation.
 *
 * Validates `access`, `handler`, `methods`, `observe`, `path`, `proxyPath`,
 * `target`, `timeout`, and `type` fields. Ensures `path` and `proxyPath`
 * start with `/`.
 */
export const proxyRouteSchema = z
  .object({
    access: z.enum(['public', 'private']).optional(),
    handler: z.function().optional(),
    methods: z
      .array(z.enum(['get', 'post', 'put', 'patch', 'delete', 'head', 'options']))
      .optional(),
    observe: z.boolean().optional(),
    path: z.string().optional(),
    proxyPath: z.string().optional(),
    target: z.string().optional(),
    timeout: z.number().optional(),
    type: z.literal('proxy').optional(),
  })
  .refine(
    (data) => {
      if (data.path === undefined) return true;
      return data.path.startsWith('/');
    },
    (data) => ({
      message: `Route path must start with / (proxy): ${data.path}`,
      path: ['path'],
    }),
  )
  .refine(
    (data) => {
      if (data.proxyPath === undefined) return true;
      return data.proxyPath.startsWith('/');
    },
    (data) => ({
      message: `Proxy route proxyPath must start with /: ${data.proxyPath}`,
      path: ['proxyPath'],
    }),
  );

/**
 * Zod schema for route structural validation — union of API and proxy route schemas.
 *
 * Accepts either an API route (with `handler`) or a proxy route (with `target` and `methods`).
 */
export const routeSchema = z.union([apiRouteSchema, proxyRouteSchema]);

/**
 * Zod schema for rate limit config structural validation.
 *
 * Validates `maxRequests` (positive integer), `windowMs` (positive integer),
 * `maxEntries` (positive integer), and `trustedProxies` (string array).
 */
export const rateLimitSchema = z
  .object({
    maxEntries: z.number().optional(),
    maxRequests: z.number().optional(),
    trustedProxies: z.array(z.string()).optional(),
    windowMs: z.number().optional(),
  })
  .strict()
  .refine(
    (data) => {
      if (data.maxEntries === undefined) return true;
      return Number.isInteger(data.maxEntries) && data.maxEntries >= 1;
    },
    {
      message: 'rateLimit.maxEntries must be a positive integer',
      path: ['maxEntries'],
    },
  );

/**
 * Zod schema for security config — validates auth, cors, csp, and rateLimit sub-fields.
 *
 * All sub-fields are optional but the schema is strict (no unknown keys allowed).
 */
export const securitySchema = z
  .object({
    auth: authSchema.optional(),
    cors: corsSchema.optional(),
    csp: cspSchema.optional(),
    rateLimit: rateLimitSchema.optional(),
  })
  .strict();

/**
 * Zod schema for OpenAPI config structural validation.
 *
 * Validates `enabled` (boolean) and `path` (string) fields. Strict mode rejects unknown keys.
 */
export const openApiSchema = z
  .object({
    enabled: z.boolean().optional(),
    path: z.string().optional(),
  })
  .strict();

/**
 * Zod schema for observability config — validates maxCollect bounds.
 *
 * Validates `logger`, `logScopeFactory`, `maxCollect` (positive, not exceeding MAX_COLLECT_BYTES),
 * `onRequest`, `onResponse`, and `requestId` fields.
 */
export const observabilitySchema = z
  .object({
    logger: z.any().optional(),
    logScopeFactory: z.function().optional(),
    maxCollect: z.number().int().positive().max(MAX_COLLECT_BYTES).optional(),
    onRequest: z.function().optional(),
    onResponse: z.function().optional(),
    requestId: z.boolean().optional(),
  })
  .strict();

/**
 * Zod schema for full server config — structural and cross-field validation.
 *
 * Validates all top-level fields and enforces cross-field rules:
 * - CORS wildcard origin is incompatible with `credentials: true`.
 * - Private routes require `security.auth` configuration.
 * - Proxy route `target` must be a valid http/https URL.
 * - Proxy route requires at least one `methods` entry.
 * - `app.port` must be an integer between 1 and 65535.
 * - `auth.secretTtl` must be a non-negative integer.
 * - `auth.algorithms` must be a non-empty array.
 * - `rateLimit.maxEntries` must be a positive integer.
 * - `observability.maxCollect` must be a positive integer not exceeding 1024 KB.
 * - API route paths and proxy route paths must start with `/`.
 * - Proxy route `proxyPath` must start with `/`.
 * - API routes require a `handler` function.
 */
export const serverConfigSchema = z
  .object({
    apiRoutes: z.array(routeSchema).optional(),
    app: appSchema.optional(),
    observability: observabilitySchema.optional(),
    openapi: openApiSchema.optional(),
    proxyRoutes: z.array(routeSchema).optional(),
    security: securitySchema.optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    const allRoutes = [...(data.apiRoutes ?? []), ...(data.proxyRoutes ?? [])];
    const hasPrivateRoute = allRoutes.some((r) => r.access === 'private');
    if (hasPrivateRoute && !data.security?.auth) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "security.auth is required when routes have access: 'private'",
        path: ['security', 'auth'],
      });
    }

    for (const [routeIdx, route] of (data.apiRoutes ?? []).entries()) {
      if (!route.handler) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'API route requires handler',
          path: ['apiRoutes', routeIdx, 'handler'],
        });
      }
    }

    for (const [routeIdx, route] of (data.proxyRoutes ?? []).entries()) {
      if (route.type !== 'proxy') continue;

      if (route.target == null || route.target === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Proxy route requires target',
          path: ['proxyRoutes', routeIdx, 'target'],
        });
      } else {
        try {
          const u = new URL(route.target);
          if (!['http:', 'https:'].includes(u.protocol)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Proxy route target is not a valid URL: ${route.target}`,
              path: ['proxyRoutes', routeIdx, 'target'],
            });
          }
        } catch {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Proxy route target is not a valid URL: ${route.target}`,
            path: ['proxyRoutes', routeIdx, 'target'],
          });
        }
      }

      if (!route.methods || route.methods.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Proxy route requires at least one method',
          path: ['proxyRoutes', routeIdx, 'methods'],
        });
      }
    }
  });
