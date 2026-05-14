import { z } from 'zod';

/** Zod schema for app config — structural validation only. */
export const appSchema = z
  .object({
    apiPrefix: z.string().optional(),
    fallback: z.string().optional(),
    name: z.string().optional(),
    port: z.number().optional(),
    root: z.string().optional(),
  })
  .strict();

/** Zod schema for CORS config — structural validation only. */
export const corsSchema = z
  .object({
    allowedHeaders: z.array(z.string()).optional(),
    credentials: z.boolean().optional(),
    exposedHeaders: z.array(z.string()).optional(),
    maxAge: z.number().optional(),
    methods: z.array(z.string()).optional(),
    origin: z.union([z.string(), z.array(z.string())]).optional(),
  })
  .strict();

/** Zod schema for CSP directives — structural validation only. */
export const cspSchema = z.record(z.string(), z.array(z.string())).optional();

/** Zod schema for auth config — structural validation only. */
export const authSchema = z
  .object({
    algorithms: z.array(z.string()).optional(),
    audience: z.string().optional(),
    jwksUri: z.string().optional(),
    secret: z.union([z.string(), z.function()]).optional(),
    secretTtl: z.number().optional(),
    strategy: z.enum(['bearer', 'jwks']).optional(),
  })
  .strict();

/** Zod schema for API route — structural validation only. */
export const apiRouteSchema = z.object({
  access: z.enum(['public', 'private']).optional(),
  handler: z.function().optional(),
  method: z.enum(['get', 'post', 'put', 'patch', 'delete', 'head', 'options']).optional(),
  observe: z.boolean().optional(),
  path: z.string().optional(),
  type: z.literal('api').optional(),
});

/** Zod schema for proxy route — structural validation only. */
export const proxyRouteSchema = z.object({
  access: z.enum(['public', 'private']).optional(),
  handler: z.function().optional(),
  methods: z.array(z.enum(['get', 'post', 'put', 'patch', 'delete', 'head', 'options'])).optional(),
  observe: z.boolean().optional(),
  path: z.string().optional(),
  proxyPath: z.string().optional(),
  target: z.string().optional(),
  timeout: z.number().optional(),
  type: z.literal('proxy').optional(),
});

/** Zod schema for individual route validation (union for api/proxy). */
export const routeSchema = z.union([apiRouteSchema, proxyRouteSchema]);

/** Zod schema for rate limit config — structural validation only. */
export const rateLimitSchema = z
  .object({
    maxEntries: z.number().optional(),
    maxRequests: z.number().optional(),
    trustedProxies: z.array(z.string()).optional(),
    windowMs: z.number().optional(),
  })
  .strict();

/** Zod schema for security config — structural validation only. */
export const securitySchema = z
  .object({
    auth: authSchema.optional(),
    cors: corsSchema.optional(),
    csp: cspSchema.optional(),
    rateLimit: rateLimitSchema.optional(),
  })
  .strict();

/** Zod schema for OpenAPI config. */
export const openApiSchema = z
  .object({
    enabled: z.boolean().optional(),
    path: z.string().optional(),
  })
  .strict();

/** Zod schema for full server config — structural + cross-field validation. */
export const serverConfigSchema = z
  .object({
    apiRoutes: z.array(routeSchema).optional(),
    app: appSchema.optional(),
    observability: z.any().optional(),
    openapi: openApiSchema.optional(),
    proxyRoutes: z.array(routeSchema).optional(),
    security: securitySchema.optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    // CORS wildcard + credentials: true rejection
    if (data.security?.cors?.credentials) {
      const origin = data.security.cors.origin;
      const isWildcard = origin === '*' || (Array.isArray(origin) && origin.includes('*'));
      if (isWildcard) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Wildcard origin cannot be used with credentials: true',
          path: ['security', 'cors', 'origin'],
        });
      }
    }

    // Private routes require security.auth
    const allRoutes = [...(data.apiRoutes ?? []), ...(data.proxyRoutes ?? [])];
    const hasPrivateRoute = allRoutes.some((r) => r.access === 'private');
    if (hasPrivateRoute && !data.security?.auth) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "security.auth is required when routes have access: 'private'",
        path: ['security', 'auth'],
      });
    }

    // CSP kebab-case detection
    if (data.security?.csp) {
      const kebabPattern = /^[a-z]+-[a-z]/;
      for (const key of Object.keys(data.security.csp)) {
        if (kebabPattern.test(key)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `CSP directive '${key}' uses kebab-case. Use camelCase instead (e.g., 'defaultSrc' not 'default-src').`,
            path: ['security', 'csp', key],
          });
        }
      }
    }

    // Port range
    if (data.app?.port !== undefined) {
      if (!Number.isInteger(data.app.port) || data.app.port < 1 || data.app.port > 65535) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'app.port must be an integer between 1 and 65535',
          path: ['app', 'port'],
        });
      }
    }

    // API route path and handler checks
    for (const [routeIdx, route] of (data.apiRoutes ?? []).entries()) {
      if (route.path && !route.path.startsWith('/')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Route path must start with / (api): ${route.path}`,
          path: ['apiRoutes', routeIdx, 'path'],
        });
      }
      if (!route.handler) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'API route requires handler',
          path: ['apiRoutes', routeIdx, 'handler'],
        });
      }
    }

    // Proxy route checks
    for (const [routeIdx, route] of (data.proxyRoutes ?? []).entries()) {
      if (route.type !== 'proxy') continue;

      if (route.path && !route.path.startsWith('/')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Route path must start with / (proxy): ${route.path}`,
          path: ['proxyRoutes', routeIdx, 'path'],
        });
      }

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

      if (route.proxyPath && !route.proxyPath.startsWith('/')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Proxy route proxyPath must start with /: ${route.proxyPath}`,
          path: ['proxyRoutes', routeIdx, 'proxyPath'],
        });
      }
    }

    // Auth strategy requirements
    if (data.security?.auth?.strategy === 'bearer') {
      const secret = data.security.auth.secret;
      if (typeof secret === 'string' && secret === '') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'auth.secret must not be empty for bearer strategy',
          path: ['security', 'auth', 'secret'],
        });
      } else if (!secret) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'auth.secret is required when strategy is bearer',
          path: ['security', 'auth', 'secret'],
        });
      }
    }

    if (data.security?.auth?.strategy === 'jwks' && !data.security.auth.jwksUri) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'auth.jwksUri is required when strategy is jwks',
        path: ['security', 'auth', 'jwksUri'],
      });
    }

    if (data.security?.auth?.secretTtl !== undefined) {
      if (!Number.isInteger(data.security.auth.secretTtl) || data.security.auth.secretTtl < 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'auth.secretTtl must be a non-negative integer (seconds)',
          path: ['security', 'auth', 'secretTtl'],
        });
      }
    }

    if (data.security?.auth?.algorithms !== undefined) {
      if (
        !Array.isArray(data.security.auth.algorithms) ||
        data.security.auth.algorithms.length === 0
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'auth.algorithms must be a non-empty array of strings',
          path: ['security', 'auth', 'algorithms'],
        });
      }
    }

    // Rate limit maxEntries positive integer
    if (data.security?.rateLimit?.maxEntries !== undefined) {
      if (
        !Number.isInteger(data.security.rateLimit.maxEntries) ||
        data.security.rateLimit.maxEntries < 1
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'rateLimit.maxEntries must be a positive integer',
          path: ['security', 'rateLimit', 'maxEntries'],
        });
      }
    }
  });
