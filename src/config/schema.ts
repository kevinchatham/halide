import { z } from 'zod';

/** Reusable schema for URL paths that must start with / */
export const PathSchema = z.string().min(1).regex(/^\//, 'path must start with /');

/**
 * Schema for SPA (Single Page Application) configuration.
 * Defines how static files are served.
 */
export const SpaConfigSchema = z.object({
  /** Name of the SPA application */
  name: z.string().default('app'),
  /** Root directory containing the SPA files */
  root: z.string(),
  /** Fallback file to serve when a route is not found */
  fallback: z.string().default('index.html'),
});

/**
 * Schema for validating HTTP request context objects.
 * Contains all information about an incoming request.
 */
export const RequestContextSchema = z.object({
  /** HTTP method of the request (GET, POST, PUT, PATCH, DELETE) */
  method: z.enum(['get', 'post', 'put', 'patch', 'delete', 'head', 'options']),
  /** URL path of the request */
  path: z.string(),
  /** HTTP headers. Values can be single strings or arrays for multi-value headers */
  headers: z.record(z.string(), z.union([z.string(), z.array(z.string())])),
  /** URL route parameters extracted from the path */
  params: z.record(z.string(), z.string()).default({}),
  /** Query string parameters. Values can be single strings or arrays for multi-value params */
  query: z.record(z.string(), z.union([z.string(), z.array(z.string())])).default({}),
  /** Request body payload (parsed based on content type) */
  body: z.unknown().optional(),
});

/**
 * Represents the context of an incoming HTTP request.
 * Contains method, path, headers, params, query, and optional body.
 */
export type RequestContext = z.infer<typeof RequestContextSchema>;

export const ResponseContextSchema = z.object({
  /** HTTP status code of the response */
  statusCode: z.number(),
  /** Duration of the request in milliseconds */
  durationMs: z.number(),
  /** Error that occurred during request handling, if any */
  error: z.instanceof(Error).optional(),
});

/**
 * Schema for observability configuration.
 * Provides hooks for custom observability implementations.
 */
export const ObservabilityConfigSchema = z.object({
  /** Hook called at the start of each request */
  onRequest: z
    .function()
    .args(RequestContextSchema, z.any().optional())
    .returns(z.void().or(z.promise(z.void())))
    .optional(),
  /** Hook called after each response with timing information */
  onResponse: z
    .function()
    .args(RequestContextSchema, z.any().optional(), ResponseContextSchema)
    .returns(z.void().or(z.promise(z.void())))
    .optional(),
});

/**
 * Schema for authentication configuration.
 * Supports bearer token and JWKS-based authentication strategies.
 *
 * Note: The .refine() validation below is only evaluated when auth is defined.
 * If auth is undefined, no validation occurs—this is intentional and allows
 * routes to mix authenticated and unauthenticated endpoints without requiring
 * auth config when not needed.
 */
export const SecurityAuthConfigSchema = z
  .object({
    /** Authentication strategy to use */
    strategy: z.enum(['bearer', 'jwks']).default('bearer'),
    /**
     * Secret key for bearer token validation (required when strategy is 'bearer').
     * Must be a function that returns the secret (Promise<string> or string),
     * enabling secure retrieval from environment variables or vault services.
     */
    secret: z
      .function()
      .args()
      .returns(z.union([z.string(), z.promise(z.string())]))
      .optional(),
    /** JWKS URI for key rotation (required when strategy is 'jwks') */
    jwksUri: z.string().url().optional(),
    /** Expected audience claim in JWT tokens */
    audience: z.string().optional(),
  })
  .refine((data) => data.strategy !== 'bearer' || data.secret !== undefined, {
    message: 'auth.secret is required when strategy is bearer',
    path: ['secret'],
  })
  .refine((data) => data.strategy !== 'jwks' || data.jwksUri !== undefined, {
    message: 'auth.jwksUri is required when strategy is jwks',
    path: ['jwksUri'],
  });

/** Base schema for validating handler functions: accepts (ctx, claims) and returns Promise<unknown> */
export const HandlerFunctionSchema = z
  .function()
  .args(z.any(), z.any())
  .returns(z.promise(z.any()));

/** Base schema for validating authorize functions: accepts (ctx, claims) and returns boolean or Promise<boolean> */
export const AuthorizeFunctionSchema = z
  .function()
  .args(z.any(), z.any())
  .returns(z.boolean().or(z.promise(z.boolean())))
  .optional();

/** Base schema for validating transform functions: accepts (body) and returns unknown */
export const TransformFunctionSchema = z.function().args(z.any()).returns(z.any()).optional();

/** Base schema for validating identity functions: accepts (ctx, claims) and returns Record<string, string> or undefined */
export const IdentityFunctionSchema = z
  .function()
  .args(z.any(), z.any())
  .returns(z.record(z.string()).or(z.undefined()))
  .optional();

/**
 * Schema for API route configuration.
 * Defines routes that are handled directly by the server.
 */
export const ApiRouteSchema = z.object({
  /** Route type identifier */
  type: z.literal('api'),
  /** URL path pattern for the route. Must start with / */
  path: PathSchema,
  /** Access level required for this route */
  access: z.enum(['public', 'private']),
  /** HTTP method this route responds to */
  method: z.enum(['get', 'post', 'put', 'patch', 'delete']).default('get'),
  /** Handler function that processes the request and returns a response */
  handler: HandlerFunctionSchema,
  /** Optional authorization function. */
  authorize: AuthorizeFunctionSchema,
  /**
   * Whether to observe and log this route.
   * If not specified, uses the global observability config as the default.
   * Individual route observe setting overrides the global setting.
   */
  observe: z.boolean().optional(),
});

/**
 * Schema for proxy route configuration.
 * Defines routes that forward requests to external services.
 */
export const ProxyRouteSchema = z.object({
  /** Route type identifier */
  type: z.literal('proxy'),
  /** URL path pattern for the route. Must start with / */
  path: PathSchema,
  /** Access level required for this route */
  access: z.enum(['public', 'private']),
  /** HTTP methods to proxy. Must be non-empty. */
  methods: z
    .array(z.enum(['get', 'post', 'put', 'patch', 'delete']))
    .min(1, 'methods must be non-empty'),
  /** Target URL to proxy requests to */
  target: z.string().url(),
  /**
   * Path to use on the target server.
   * If not provided, the original request path is forwarded as-is.
   */
  proxyPath: z.string().regex(/^\//, 'proxyPath must be a valid path starting with /').optional(),
  /**
   * Optional function to add custom identity headers to proxied requests.
   * Receives (ctx, claims) and returns headers to add or undefined.
   */
  identity: IdentityFunctionSchema,
  /**
   * Optional authorization function. Returns true to allow, false to deny.
   */
  authorize: AuthorizeFunctionSchema,
  /**
   * Optional function to transform the proxy response.
   * Receives { body, headers } and returns transformed { body, headers }.
   */
  transform: z
    .function()
    .args(z.object({ body: z.unknown(), headers: z.record(z.string(), z.string()) }))
    .returns(
      z
        .object({ body: z.unknown(), headers: z.record(z.string(), z.string()) })
        .or(z.promise(z.object({ body: z.unknown(), headers: z.record(z.string(), z.string()) })))
    )
    .optional(),
  /** Retry configuration for failed proxy requests */
  retries: z
    .object({
      /** Number of retry attempts */
      attempts: z.number().min(1).default(3),
      /** Backoff strategy for retries */
      backoff: z.enum(['exponential', 'linear', 'fixed']).default('exponential'),
    })
    .optional(),
  /** Timeout in milliseconds for proxy requests */
  timeout: z.number().min(1000).optional(),
  /**
   * Whether to observe and log this route.
   * If not specified, uses the global observability config as the default.
   * Individual route observe setting overrides the global setting.
   */
  observe: z.boolean().optional(),
});

/**
 * Schema for route configuration.
 * A route can be either an API route (handled directly by the server) or
 * a proxy route (forwards requests to external services).
 */
export const RouteSchema = z.union([ApiRouteSchema, ProxyRouteSchema]);

/**
 * Schema for CORS (Cross-Origin Resource Sharing) configuration.
 * Controls how cross-origin requests are handled by specifying allowed origins,
 * methods, headers, credentials, and caching behavior for preflight requests.
 */
export const CorsConfigSchema = z
  .object({
    origin: z.union([z.string(), z.array(z.string())]).default(['*']),
    methods: z
      .array(z.enum(['get', 'post', 'put', 'delete', 'patch', 'head', 'options']))
      .default(['get', 'post', 'put', 'delete', 'patch']),
    allowedHeaders: z.array(z.string()).optional(),
    exposedHeaders: z.array(z.string()).optional(),
    credentials: z.boolean().default(false),
    maxAge: z.number().min(0).optional(),
  })
  .refine(
    (data) => {
      if (data.credentials && Array.isArray(data.origin) && data.origin.includes('*')) {
        return false;
      }
      if (data.credentials && data.origin === '*') {
        return false;
      }
      return true;
    },
    {
      message: 'Wildcard origin cannot be used with credentials: true. Specify explicit origins.',
      path: ['origin'],
    }
  );

export const SecurityConfigSchema = z.object({
  /** CORS configuration for cross-origin request handling */
  cors: CorsConfigSchema.optional(),
  /** CSP (Content Security Policy) configuration */
  csp: z.record(z.string(), z.array(z.string())).default({}),
  /** Authentication configuration for protecting routes */
  auth: SecurityAuthConfigSchema.optional(),
  /** Rate limiting configuration to prevent abuse */
  rateLimit: z
    .object({
      /** Time window in milliseconds for rate limiting */
      windowMs: z.number().min(1000).default(900000),
      /** Maximum number of requests allowed within the time window */
      maxRequests: z.number().min(1).default(100),
    })
    .optional(),
});

/**
 * Schema for the complete server configuration.
 * Validates all aspects of the BFF server setup.
 */
export const ServerConfigSchema = z
  .object({
    /** SPA (Single Page Application) serving configuration */
    spa: SpaConfigSchema,
    /** Array of route definitions for the server */
    routes: z.array(RouteSchema).optional(),
    /** Observability settings for tracing and logging */
    observability: ObservabilityConfigSchema.optional(),
    /** Security settings including CORS, CSP, auth, and rate limiting */
    security: SecurityConfigSchema.optional(),
  })
  .refine(
    (data) => {
      const hasPrivateRoute = data.routes?.some((route) => route.access === 'private');
      if (hasPrivateRoute && !data.security?.auth) {
        return false;
      }
      return true;
    },
    {
      message: "security.auth is required when routes have access: 'private'",
    }
  );
