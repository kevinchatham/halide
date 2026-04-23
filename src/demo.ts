/**
 * Demo implementation showcasing halide's API design.
 *
 * This file demonstrates how to configure a halide server with:
 * - API routes (public and private with authorization)
 * - Proxy routes with request transformation
 * - Observability hooks for request/response logging
 * - Security configuration (CORS, CSP, JWT auth, rate limiting)
 * - SPA serving configuration
 *
 * Used for development and API design validation only.
 */

import { z } from 'zod';
import { createServer, type Server } from './config/runtime'; // from 'halide';
import { apiRoute, proxyRoute } from './index';
import type {
  ApiRoute,
  Logger,
  ObservabilityConfig,
  OpenApiConfig,
  ProxyRoute,
  RequestContext,
  ResponseContext,
  SecurityConfig,
  ServerConfig,
  SpaConfig,
} from './types'; // from 'halide'

/** Custom JWT payload shape used across all authenticated routes in this demo. */
interface UserClaims {
  role: string;
  sub: string;
}

/** Zod schema validating the request body for creating a new user. */
const CreateUserSchema: z.ZodObject<{ email: z.ZodString; name: z.ZodString }> = z.object({
  email: z.string().email(),
  name: z.string().min(1),
});

/** Inferred TypeScript type from {@link CreateUserSchema}. */
type CreateUserSchema = z.infer<typeof CreateUserSchema>;

/**
 * Private GET /profile route.
 * - `access: 'private'`: requires a valid JWT bearer token
 * - `authorize`: restricts access to users with the 'admin' role
 * - `handler`: returns the request context and authenticated user subject
 */
const profileRoute: ApiRoute<UserClaims> = apiRoute<UserClaims>({
  access: 'private',
  authorize: (_ctx: RequestContext, claims: UserClaims | undefined, _logger: Logger) =>
    !!claims?.role && claims.role === 'admin',
  handler: async (
    ctx: RequestContext & { body: unknown },
    claims: UserClaims | undefined,
    _logger: Logger,
  ) => ({
    ctx: JSON.stringify(ctx),
    user: claims?.sub,
  }),
  method: 'get',
  path: '/profile',
});

/**
 * Public POST /users route.
 * - `access: 'public'`: no authentication required
 * - `validationSchema`: Zod schema validating that body contains a valid email and non-empty name
 * - `handler`: creates a user with a generated UUID, timestamp, and the validated body fields
 */
const userRoute: ApiRoute<UserClaims, CreateUserSchema> = apiRoute<UserClaims, CreateUserSchema>({
  access: 'public',
  handler: async (
    ctx: RequestContext & { body: CreateUserSchema },
    _claims: UserClaims | undefined,
    _logger: Logger,
  ) => {
    return {
      createdAt: new Date().toISOString(),
      email: ctx.body.email,
      id: crypto.randomUUID(),
      name: ctx.body.name,
    };
  },
  method: 'post',
  path: '/users',
  validationSchema: CreateUserSchema,
});

/**
 * Public GET /health route.
 * - `access: 'public'`: no authentication required
 * - `handler`: returns `{ status: 'ok' }`, useful for load balancer health checks
 */
const healthRoute: ApiRoute<unknown> = apiRoute({
  access: 'public',
  handler: async () => ({ status: 'ok' }),
  method: 'get',
  path: '/health',
});

/**
 * Private proxy route forwarding /api/users to https://api.example.com/users.
 * - `access: 'private'`: requires a valid JWT bearer token
 * - `methods`: supports GET and POST
 * - `proxyPath`: rewrites the path from '/api/users' to '/users' on the target
 * - `timeout`: aborts the proxy request after 5000ms
 * - `transform`: merges a `transformed: true` flag into the request body before forwarding
 */
const usersProxyRoute: ProxyRoute<UserClaims> = proxyRoute<UserClaims>({
  access: 'private',
  methods: ['get', 'post'],
  path: '/api/users',
  proxyPath: '/users',
  target: 'https://api.example.com',
  timeout: 5000,
  transform: ({ body, headers }: { body: unknown; headers: Record<string, string> }) => ({
    body: {
      ...(typeof body === 'object' && body ? body : {}),
      transformed: true,
    },
    headers,
  }),
});

/**
 * Private proxy route forwarding /api/orders to https://api.example.com/api/orders.
 * - `access: 'private'`: requires a valid JWT bearer token
 * - `methods`: supports GET only
 * - `proxyPath`: omitted, so '/api/orders' is forwarded as-is to the target
 * - `authorize`: allows both 'admin' and 'user' roles
 */
const ordersProxyRoute: ProxyRoute<UserClaims> = proxyRoute<UserClaims>({
  access: 'private',
  authorize: (_ctx: RequestContext, claims: UserClaims | undefined, _logger: Logger) =>
    !!claims?.role && (claims.role === 'admin' || claims.role === 'user'),
  methods: ['get'],
  path: '/api/orders',
  target: 'https://api.example.com',
});

/**
 * Observability hooks for request/response lifecycle logging.
 * - `onRequest`: called on every incoming request with the request context and decoded JWT claims
 * - `onResponse`: called when a response is sent, includes status code and duration in milliseconds
 */
const observability: ObservabilityConfig<UserClaims> = {
  logger: {
    debug: (..._args: unknown[]) => {},
    error: (..._args: unknown[]) => {},
    info: (..._args: unknown[]) => {},
    warn: (..._args: unknown[]) => {},
  },
  onRequest: (ctx: RequestContext, claims: UserClaims | undefined, logger: Logger) => {
    logger.info(`[Request] ${ctx.method} ${ctx.path} (user: ${claims?.sub ?? 'anonymous'})`);
  },
  onResponse: (
    ctx: RequestContext,
    claims: UserClaims | undefined,
    { statusCode, durationMs }: ResponseContext,
    logger: Logger,
  ) => {
    logger.info(
      `[Response] ${ctx.method} ${ctx.path} ${statusCode} ${durationMs}ms (user: ${claims?.sub ?? 'anonymous'})`,
    );
  },
};

/**
 * Security configuration for the server.
 * - `cors.credentials`: allows cookies and credentials in cross-origin requests
 * - `cors.methods`: HTTP methods permitted for cross-origin requests
 * - `cors.origin`: allowed origins for cross-origin requests (Angular dev server)
 * - `csp.directives.defaultSrc`: Content-Security-Policy directive restricting resource loading to same-origin
 * - `auth.strategy`: authentication strategy ('bearer' for JWT bearer tokens)
 * - `auth.secret`: function returning the JWT secret from the JWT_SECRET environment variable
 * - `rateLimit.maxRequests`: maximum number of requests allowed per window
 * - `rateLimit.windowMs`: time window in milliseconds for rate limiting (15 minutes)
 */
const security: SecurityConfig = {
  auth: {
    secret: () => process.env.JWT_SECRET ?? '',
    strategy: 'bearer',
  },
  cors: {
    credentials: true,
    methods: ['get', 'post', 'put', 'delete', 'patch'],
    origin: ['http://localhost:4200'],
  },
  csp: {
    directives: {
      defaultSrc: ["'self'"],
    },
  },
  rateLimit: {
    maxRequests: 100,
    windowMs: 900000,
  },
};

/**
 * SPA serving configuration.
 * - `name`: application identifier used for logging
 * - `root`: absolute path to the directory containing static assets
 * - `fallback`: file served for unmatched routes to support client-side routing
 */
const spa: SpaConfig = {
  fallback: 'index.html',
  name: 'my-app',
  root: '/var/www',
};

/**
 * OpenAPI/Swagger UI configuration.
 * - `enabled`: toggles the Swagger UI endpoint and OpenAPI spec serving
 * - `path`: URL path where Swagger UI is served (defaults to '/swagger')
 * - `options.title`: title displayed in the Swagger UI page header
 * - `options.description`: description shown below the title in Swagger UI
 */
const openapi: OpenApiConfig = {
  enabled: true,
  options: {
    description: 'Auto-generated API documentation',
    title: 'My App API',
  },
  path: '/swagger',
};

/**
 * Complete server configuration combining all settings.
 * - `spa`: static file serving and client-side routing fallback
 * - `security`: CORS, CSP, authentication, and rate limiting
 * - `observability`: request/response lifecycle hooks
 * - `apiRoutes`: direct API endpoint handlers (public and private)
 * - `proxyRoutes`: reverse proxy routes with optional transformation
 * - `openapi`: Swagger UI and OpenAPI spec configuration
 *
 * Passed to `createServer()` to bootstrap the halide BFF server.
 */
const exampleConfig: ServerConfig<UserClaims> = {
  apiRoutes: [profileRoute, userRoute as unknown as ApiRoute<UserClaims>, healthRoute],
  observability,
  openapi,
  proxyRoutes: [usersProxyRoute, ordersProxyRoute],
  security,
  spa,
};

const server: Server = createServer(exampleConfig);

server.start((port) => {
  observability.logger?.info(`Server running on port ${port}`);
});
