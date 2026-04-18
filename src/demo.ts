/**
 * Demo implementation showcasing bSPA's API design.
 *
 * This file demonstrates how to configure a bSPA server with:
 * - API routes (public and private with authorization)
 * - Proxy routes with request transformation and retries
 * - Observability hooks for request/response logging
 * - Security configuration (CORS, CSP, JWT auth, rate limiting)
 * - SPA serving configuration
 *
 * Used for development and API design validation only.
 */

import { z } from 'zod';
import {
  type ObservabilityConfig,
  type RequestContext,
  type SecurityConfig,
  type ServerConfig,
  type SpaConfig,
  apiRoute,
  proxyRoute,
} from './config/types'; // from 'bspa'
import { createServer } from './runtime'; // from 'bspa';

/** Custom JWT payload shape used across all authenticated routes in this demo. */
interface UserClaims {
  role: string;
  sub: string;
}

/** Zod schema validating the request body for creating a new user. */
const CreateUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
});

/** Inferred TypeScript type from {@link CreateUserSchema}. */
type CreateUserSchema = z.infer<typeof CreateUserSchema>;

/**
 * Private GET /profile route.
 * Requires a valid JWT and restricts access to users with the 'admin' role.
 */
const profileRoute = apiRoute<UserClaims>({
  access: 'private',
  method: 'get',
  path: '/profile',
  authorize: (_ctx, claims) => !!claims?.role && claims.role === 'admin',
  handler: async (ctx, claims) => ({
    ctx: JSON.stringify(ctx),
    user: claims?.sub,
  }),
});

/**
 * Public POST /users route.
 * Demonstrates request body validation using a Zod schema.
 */
const userRoute = apiRoute<UserClaims, CreateUserSchema>({
  access: 'public',
  method: 'post',
  path: '/users',
  validationSchema: CreateUserSchema,
  handler: async (ctx) => {
    return {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      email: ctx.body.email,
      name: ctx.body.name,
    };
  },
});

/**
 * Public GET /health route.
 * Simple endpoint that requires no authentication, useful for load balancer health checks.
 */
const healthRoute = apiRoute({
  access: 'public',
  method: 'get',
  path: '/health',
  handler: async () => ({ status: 'ok' }),
});

/**
 * Private proxy route forwarding /api/users to https://api.example.com/users.
 * Demonstrates path rewriting, exponential backoff retries, request transformation, and a timeout.
 * Supports GET and POST methods.
 */
const usersProxyRoute = proxyRoute<UserClaims>({
  access: 'private',
  methods: ['get', 'post'],
  path: '/api/users',
  proxyPath: '/users',
  target: 'https://api.example.com',
  timeout: 5000,
  retries: {
    attempts: 3,
    backoff: 'exponential',
  },
  transform: ({ body, headers }) => ({
    body: {
      ...(typeof body === 'object' && body ? body : {}),
      transformed: true,
    },
    headers,
  }),
});

/**
 * Private proxy route forwarding /api/orders to https://api.example.com/api/orders.
 * Demonstrates role-based authorization where both 'admin' and 'user' roles are allowed.
 * `proxyPath` is omitted, so the matched path is forwarded as-is.
 */
const ordersProxyRoute = proxyRoute<UserClaims>({
  access: 'private',
  methods: ['get'],
  path: '/api/orders',
  target: 'https://api.example.com',
  authorize: (ctx: RequestContext, claims: UserClaims | undefined) =>
    !!claims?.role && (claims.role === 'admin' || claims.role === 'user'),
});

/**
 * Observability hooks for request lifecycle logging.
 * Logs each incoming request and its corresponding response with status code and duration.
 */
const observability: ObservabilityConfig<UserClaims> = {
  onRequest: (ctx, claims) => {
    console.log(`[Request] ${ctx.method} ${ctx.path} (user: ${claims?.sub ?? 'anonymous'})`);
  },
  onResponse: (ctx, claims, { statusCode, durationMs }) => {
    console.log(
      `[Response] ${ctx.method} ${ctx.path} ${statusCode} ${durationMs}ms (user: ${claims?.sub ?? 'anonymous'})`
    );
  },
};

/**
 * Security configuration for the server.
 * - CORS: allows requests from the Angular dev server on localhost:4200
 * - CSP: restricts resource loading to same-origin
 * - Auth: bearer token strategy using the JWT_SECRET environment variable
 * - Rate limiting: 100 requests per 15-minute window
 */
const security: SecurityConfig = {
  cors: {
    credentials: true,
    methods: ['get', 'post', 'put', 'delete', 'patch'],
    origin: ['http://localhost:4200'],
  },
  csp: {
    'default-src': ["'self'"],
  },
  auth: {
    strategy: 'bearer',
    secret: () => process.env.JWT_SECRET ?? '',
  },
  rateLimit: {
    maxRequests: 100,
    windowMs: 900000,
  },
};

/**
 * SPA serving configuration.
 * Specifies the static file root and fallback for client-side routing.
 */
const spa: SpaConfig = {
  name: 'my-app',
  root: '/var/www',
  fallback: 'index.html',
};

/**
 * Complete server configuration combining all settings.
 * Passed to `createServer()` to bootstrap the bSPA BFF server.
 */
const exampleConfig: ServerConfig<UserClaims> = {
  spa,
  security,
  observability,
  apiRoutes: [profileRoute, userRoute, healthRoute],
  proxyRoutes: [usersProxyRoute, ordersProxyRoute],
};

createServer(exampleConfig).then((server) => server.start());
