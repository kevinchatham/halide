/**
 * Demo implementation showcasing halide's API design.
 *
 * This file demonstrates how to configure a halide server with:
 * - API routes (public and private with authorization)
 * - Proxy routes with request transformation
 * - Observability hooks for request/response logging
 * - Security configuration (CORS, CSP, JWT auth, rate limiting)
 * - App serving configuration
 *
 * Used for development and API design validation only.
 */

import { z } from 'zod';
import { createServer, type Server } from './config/runtime'; // from 'halide';
import { apiRoute, proxyRoute } from './index';
import type { ServerConfig } from './types';
import type { ApiRoute, ProxyRoute } from './types/api';
import type {
  AppConfig,
  ObservabilityConfig,
  RequestContext,
  ResponseContext,
  THalideApp,
} from './types/app';
import type { OpenApiConfig } from './types/openapi';
import type { SecurityConfig } from './types/security';

/** Custom JWT payload shape used across all authenticated routes in this demo. */
interface UserClaims {
  /** User role, e.g. 'admin' or 'user'. */
  role: string;
  /** Subject identifier (typically a user ID). */
  sub: string;
}

/** Bundled app context for this demo, combining UserClaims JWT payload with default log scope. */
type DemoApp = THalideApp<UserClaims>;

/** Zod schema validating the request body for creating a new user (email and name fields). */
const CreateUserSchema: z.ZodObject<{ email: z.ZodString; name: z.ZodString }> = z.object({
  email: z.string().email(),
  name: z.string().min(1),
});

/** Inferred TypeScript type from {@link CreateUserSchema}. */
/** Inferred TypeScript type from {@link CreateUserSchema}: `{ email: string; name: string }`. */
type CreateUserSchema = z.infer<typeof CreateUserSchema>;

/**
 * Private GET /profile route.
 * - `access: 'private'`: requires a valid JWT bearer token
 * - `authorize`: restricts access to users with the 'admin' role
 * - `handler`: returns the request context and authenticated user subject
 */
const profileRoute: ApiRoute<DemoApp> = apiRoute<DemoApp>({
  access: 'private',
  authorize: (_ctx: RequestContext, app: DemoApp) =>
    !!app.claims?.role && app.claims.role === 'admin',
  handler: async (ctx: RequestContext & { body: unknown }, app: DemoApp) => ({
    ctx: JSON.stringify(ctx),
    user: app.claims?.sub,
  }),
  method: 'get',
  path: '/profile',
});

/**
 * Public POST /users route.
 * - `access: 'public'`: no authentication required
 * - `requestSchema`: Zod schema validating that body contains a valid email and non-empty name
 * - `handler`: creates a user with a generated UUID, timestamp, and the validated body fields
 */
const userRoute: ApiRoute<DemoApp, CreateUserSchema> = apiRoute<DemoApp, CreateUserSchema>({
  access: 'public',
  handler: async (ctx: RequestContext & { body: CreateUserSchema }, _app: DemoApp) => {
    return {
      createdAt: new Date().toISOString(),
      email: ctx.body.email,
      id: crypto.randomUUID(),
      name: ctx.body.name,
    };
  },
  method: 'post',
  path: '/users',
  requestSchema: CreateUserSchema,
});

/**
 * Public GET /health route.
 * - `access: 'public'`: no authentication required
 * - `handler`: returns `{ status: 'ok' }`, useful for load balancer health checks
 */
const healthRoute: ApiRoute<DemoApp> = apiRoute({
  access: 'public',
  handler: async (_ctx: RequestContext & { body: unknown }, _app: DemoApp) => ({ status: 'ok' }),
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
const usersProxyRoute: ProxyRoute<DemoApp> = proxyRoute<DemoApp>({
  access: 'private',
  methods: ['get', 'post'],
  path: '/api/users',
  proxyPath: '/users',
  target: 'https://api.example.com',
  timeout: 5000,
  transform: ({
    method: _method,
    body,
    headers,
  }: {
    method: 'get' | 'post' | 'put' | 'patch' | 'delete' | 'head' | 'options';
    body: unknown;
    headers: Record<string, string>;
  }) => ({
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
const ordersProxyRoute: ProxyRoute<DemoApp> = proxyRoute<DemoApp>({
  access: 'private',
  authorize: (_ctx: RequestContext, app: DemoApp) =>
    !!app.claims?.role && (app.claims.role === 'admin' || app.claims.role === 'user'),
  methods: ['get'],
  path: '/api/orders',
  target: 'https://api.example.com',
});

/**
 * Observability hooks for request/response lifecycle logging.
 * - `onRequest`: called on every incoming request with the request context and app
 * - `onResponse`: called when a response is sent, includes status code and duration in milliseconds
 */
const observability: ObservabilityConfig<DemoApp> = {
  logger: {
    debug: (_scope: unknown, ..._args: unknown[]) => {},
    error: (_scope: unknown, ..._args: unknown[]) => {},
    info: (_scope: unknown, ..._args: unknown[]) => {},
    warn: (_scope: unknown, ..._args: unknown[]) => {},
  },
  onRequest: (ctx: RequestContext, app: DemoApp) => {
    app.logger.info(
      ctx,
      `[Request] ${ctx.method} ${ctx.path} (user: ${app.claims?.sub ?? 'anonymous'})`,
    );
  },
  onResponse: (ctx: RequestContext, app: DemoApp, { statusCode, durationMs }: ResponseContext) => {
    app.logger.info(
      ctx,
      `[Response] ${ctx.method} ${ctx.path} ${statusCode} ${durationMs}ms (user: ${app.claims?.sub ?? 'anonymous'})`,
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
 * App serving configuration.
 * - `name`: application identifier used for logging
 * - `root`: absolute path to the directory containing static assets
 * - `fallback`: file served for unmatched routes to support client-side routing
 */
const app: AppConfig = {
  fallback: 'index.html',
  name: 'my-app',
  root: 'dist',
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
 * - `app`: static file serving and client-side routing fallback
 * - `security`: CORS, CSP, authentication, and rate limiting
 * - `observability`: request/response lifecycle hooks
 * - `apiRoutes`: direct API endpoint handlers (public and private)
 * - `proxyRoutes`: reverse proxy routes with optional transformation
 * - `openapi`: Swagger UI and OpenAPI spec configuration
 *
 * Passed to `createServer()` to bootstrap the halide BFF server.
 */
const exampleConfig: ServerConfig<DemoApp> = {
  apiRoutes: [profileRoute, userRoute as unknown as ApiRoute<DemoApp>, healthRoute],
  app,
  observability,
  openapi,
  proxyRoutes: [usersProxyRoute, ordersProxyRoute],
  security,
};

const server: Server = createServer(exampleConfig);

server.start((port) => {
  // biome-ignore lint/suspicious/noConsole: demo
  console.log(`Server running on port ${port}`);
});
