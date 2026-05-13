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
export const cspSchema = z
  .object({
    directives: z.record(z.string(), z.array(z.string())).optional(),
  })
  .strict();

/** Zod schema for auth config — structural validation only. */
export const authSchema = z
  .object({
    algorithms: z.array(z.string()).optional(),
    audience: z.string().optional(),
    jwksUri: z.string().optional(),
    secret: z.function().optional(),
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

/** Zod schema for full server config — structural validation only. */
export const serverConfigSchema = z
  .object({
    apiRoutes: z.array(routeSchema).optional(),
    app: appSchema.optional(),
    observability: z.any().optional(),
    openapi: openApiSchema.optional(),
    proxyRoutes: z.array(routeSchema).optional(),
    security: securitySchema.optional(),
  })
  .strict();
