/**
 * Context object for incoming HTTP requests.
 */
export type RequestContext = {
  /** HTTP method of the request. */
  method: 'get' | 'post' | 'put' | 'patch' | 'delete' | 'head' | 'options';
  /** URL path of the request. */
  path: string;
  /** Request headers as key-value pairs. */
  headers: Record<string, string | string[]>;
  /** URL route parameters extracted from the path pattern. */
  params: Record<string, string>;
  /** URL query string parameters as key-value pairs. */
  query: Record<string, string | string[]>;
  /** Request body content, if present. */
  body?: unknown;
};

/**
 * Context object for HTTP responses.
 */
export type ResponseContext = {
  /** HTTP status code of the response. */
  statusCode: number;
  /** Time taken to process the request in milliseconds. */
  durationMs: number;
  /** Error that occurred during request processing, if any. */
  error?: Error;
};

/**
 * Handler function for API routes.
 * @template TClaims - The type of claims contained in the JWT.
 * @param ctx - The request context.
 * @param claims - The JWT claims, or undefined if not authenticated.
 * @returns The response body.
 */
export type ApiRouteHandler<TClaims> = (
  ctx: RequestContext,
  claims: TClaims | undefined
) => Promise<unknown>;

/**
 * Authorization function for route access control.
 * @template TClaims - The type of claims contained in the JWT.
 * @param ctx - The request context.
 * @param claims - The JWT claims, or undefined if not authenticated.
 * @returns Whether the request is authorized.
 */
export type AuthorizeFn<TClaims> = (
  ctx: RequestContext,
  claims: TClaims | undefined
) => boolean | Promise<boolean>;

/**
 * Function to transform proxy response data.
 * @param response - The response object containing body and headers.
 * @returns The transformed response or a promise of it.
 */
export type TransformFn = (response: {
  body: unknown;
  headers: Record<string, string>;
}) =>
  | { body: unknown; headers: Record<string, string> }
  | Promise<{ body: unknown; headers: Record<string, string> }>;

/**
 * Configuration for single-page application serving.
 */
export type SpaConfig = {
  /** Path to the fallback index.html file for client-side routing. */
  fallback?: string;
  /** Name of the SPA application. */
  name?: string;
  /** Root directory path from which to serve static files. */
  root: string;
};

/**
 * Configuration for observability hooks.
 * @template TClaims - The type of claims contained in the JWT.
 */
export type ObservabilityConfig<TClaims = unknown> = {
  /** Hook called when a request is received. */
  onRequest?: (ctx: RequestContext, claims: TClaims | undefined) => void | Promise<void>;
  /** Hook called when a response is sent. */
  onResponse?: (
    ctx: RequestContext,
    claims: TClaims | undefined,
    response: ResponseContext
  ) => void | Promise<void>;
};

/**
 * Configuration for Cross-Origin Resource Sharing (CORS).
 */
export type CorsConfig = {
  /** List of allowed request headers. */
  allowedHeaders?: string[];
  /** Whether to allow credentials in CORS requests. */
  credentials?: boolean;
  /** List of headers exposed to the browser. */
  exposedHeaders?: string[];
  /** Maximum time in seconds to cache preflight responses. */
  maxAge?: number;
  /** List of allowed HTTP methods for CORS requests. */
  methods?: Array<'get' | 'post' | 'put' | 'delete' | 'patch' | 'head' | 'options'>;
  /** Allowed origin(s) for CORS requests. */
  origin?: string | string[];
};

/**
 * Configuration for authentication strategy.
 */
export type SecurityAuthConfig = {
  /** Expected audience claim in JWTs. */
  audience?: string;
  /** URI to the JSON Web Key Set for JWKS strategy. */
  jwksUri?: string;
  /** Authentication strategy to use. */
  strategy?: 'bearer' | 'jwks';
  /** Secret key or function returning it for bearer strategy. */
  secret?: () => string | Promise<string>;
};

/**
 * Security configuration for the server.
 */
export type SecurityConfig = {
  /** Authentication configuration. */
  auth?: SecurityAuthConfig;
  /** CORS configuration. */
  cors?: CorsConfig;
  /** Content Security Policy directives. */
  csp?: Record<string, string[]>;
  /** Rate limiting configuration. */
  rateLimit?: { maxRequests?: number; windowMs?: number };
};

/**
 * Main server configuration.
 * @template TClaims - The type of claims contained in the JWT.
 */
export type ServerConfig<TClaims = unknown> = {
  /** Observability hook configuration. */
  observability?: ObservabilityConfig<TClaims>;
  /** List of route definitions. */
  routes?: Route<TClaims>[];
  /** Security configuration. */
  security?: SecurityConfig;
  /** SPA serving configuration. */
  spa: SpaConfig;
};

/**
 * Definition for an API route handler.
 * @template TClaims - The type of claims contained in the JWT.
 */
export type ApiRoute<TClaims = unknown> = {
  /** Whether the route requires authentication. */
  access: 'public' | 'private';
  /** HTTP method for the route. */
  method?: 'get' | 'post' | 'put' | 'patch' | 'delete';
  /** Whether to include this route in observability hooks. */
  observe?: boolean;
  /** URL path pattern for the route. */
  path: string;
  /** Discriminator for route type. */
  type: 'api';
  /** Authorization function for the route. */
  authorize?: AuthorizeFn<TClaims>;
  /** Handler function for the route. */
  handler: ApiRouteHandler<TClaims>;
};

/**
 * Definition for a proxy route that forwards requests to a target.
 * @template TClaims - The type of claims contained in the JWT.
 */
export type ProxyRoute<TClaims = unknown> = {
  /** Whether the route requires authentication. */
  access: 'public' | 'private';
  /** HTTP methods allowed for this proxy route. */
  methods: Array<'get' | 'post' | 'put' | 'patch' | 'delete'>;
  /** Whether to include this route in observability hooks. */
  observe?: boolean;
  /** URL path pattern for the route. */
  path: string;
  /** Path to append to the target URL when proxying. */
  proxyPath?: string;
  /** Retry configuration for failed proxy requests. */
  retries?: { attempts: number; backoff: 'exponential' | 'linear' | 'fixed' };
  /** Target URL to proxy requests to. */
  target: string;
  /** Timeout in milliseconds for proxy requests. */
  timeout?: number;
  /** Discriminator for route type. */
  type: 'proxy';
  /** Authorization function for the route. */
  authorize?: AuthorizeFn<TClaims>;
  /** Function to extract identity headers from request context. */
  identity?: (ctx: RequestContext, claims: TClaims) => Record<string, string> | undefined;
  /** Function to transform proxy responses. */
  transform?: TransformFn;
};

/**
 * Union type for all route definitions.
 * @template TClaims - The type of claims contained in the JWT.
 */
export type Route<TClaims = unknown> = ApiRoute<TClaims> | ProxyRoute<TClaims>;

/**
 * Input type for creating an API route (excludes computed fields).
 * @template TClaims - The type of claims contained in the JWT.
 */
export type ApiRouteInput<TClaims> = Omit<ApiRoute<TClaims>, 'type' | 'authorize'> & {
  /** Authorization function for the route. */
  authorize?: AuthorizeFn<TClaims>;
};

/**
 * Input type for creating a proxy route (excludes computed fields).
 * @template TClaims - The type of claims contained in the JWT.
 */
export type ProxyRouteInput<TClaims> = Omit<ProxyRoute<TClaims>, 'type'>;

/**
 * Factory function to create an API route with default values.
 * @template TClaims - The type of claims contained in the JWT.
 * @param route - The API route input configuration.
 * @returns A fully configured API route.
 */
export function apiRoute<TClaims>(route: ApiRouteInput<TClaims>): ApiRoute<TClaims> {
  return {
    access: route.access,
    method: route.method,
    observe: route.observe,
    path: route.path,
    type: 'api',
    handler: route.handler,
    authorize: route.authorize ?? (async () => true),
  };
}

/**
 * Factory function to create a proxy route with default values.
 * @template TClaims - The type of claims contained in the JWT.
 * @param route - The proxy route input configuration.
 * @returns A fully configured proxy route.
 */
export function proxyRoute<TClaims>(route: ProxyRouteInput<TClaims>): ProxyRoute<TClaims> {
  return {
    access: route.access,
    methods: route.methods,
    observe: route.observe,
    path: route.path,
    proxyPath: route.proxyPath,
    retries: route.retries,
    target: route.target,
    timeout: route.timeout,
    type: 'proxy',
    identity: route.identity,
    authorize: route.authorize ?? (async () => true),
    transform: route.transform,
  };
}
