import type { Context } from 'hono';
import type { ContentSecurityPolicyOptionHandler } from 'hono/secure-headers';
import type { ZodSchema } from 'zod';

/**
 * Function that extracts JWT claims from a request context.
 * @typeParam TClaims - The type of the decoded JWT claims object.
 */
export type ClaimExtractor<TClaims = unknown> = (c: Context) => Promise<TClaims | null>;

/**
 * Value for a Content Security Policy directive. Can be a string or a custom handler.
 */
export type CspDirectiveValue = string | ContentSecurityPolicyOptionHandler;

/**
 * Content Security Policy directives for the server.
 * Each directive controls which resources can be loaded and from where.
 */
export type CspDirectives = {
  /** Limits the URLs that can appear in a page's <base> element. */
  baseUri?: CspDirectiveValue[];
  /** Restricts the URLs for workers and embedded frame contents. */
  childSrc?: CspDirectiveValue[];
  /** Restricts the URLs that can be loaded using script, connect, fetch, or XHR. */
  connectSrc?: CspDirectiveValue[];
  /** Serves as a fallback for other directives when they are not explicitly defined. */
  defaultSrc?: CspDirectiveValue[];
  /** Controls the sources for fonts loaded via @font-face. */
  fontSrc?: CspDirectiveValue[];
  /** Restricts the URLs that can be used as the target of form submissions. */
  formAction?: CspDirectiveValue[];
  /** Specifies valid parents for embedding this page in a frame, iframe, or object. */
  frameAncestors?: CspDirectiveValue[];
  /** Controls the sources for frames and iframes. */
  frameSrc?: CspDirectiveValue[];
  /** Controls the sources for images and favicons. */
  imgSrc?: CspDirectiveValue[];
  /** Controls the sources for web manifests. */
  manifestSrc?: CspDirectiveValue[];
  /** Controls the sources for media files (audio and video). */
  mediaSrc?: CspDirectiveValue[];
  /** Controls the sources for plugins (e.g., <object>, <embed>). */
  objectSrc?: CspDirectiveValue[];
  /** Enables restrictions on what the page can do (like sandboxing). */
  sandbox?: CspDirectiveValue[];
  /** Controls the sources for JavaScript scripts. */
  scriptSrc?: CspDirectiveValue[];
  /** Controls the sources for inline event handlers (e.g., onclick). */
  scriptSrcAttr?: CspDirectiveValue[];
  /** Controls the sources for <script> elements. */
  scriptSrcElem?: CspDirectiveValue[];
  /** Controls the sources for stylesheets. */
  styleSrc?: CspDirectiveValue[];
  /** Controls the sources for inline styles applied via the style attribute. */
  styleSrcAttr?: CspDirectiveValue[];
  /** Controls the sources for <style> elements. */
  styleSrcElem?: CspDirectiveValue[];
  /** Instructs the browser to upgrade HTTP requests to HTTPS. */
  upgradeInsecureRequests?: CspDirectiveValue[];
  /** Controls the sources for Web Workers. */
  workerSrc?: CspDirectiveValue[];
};

/**
 * Configuration options for Content Security Policy.
 */
export type CspOptions = {
  /** CSP directives to apply. See {@link CspDirectives}. */
  directives?: CspDirectives;
};

/**
 * Metadata for OpenAPI/Scalar documentation generation on a route.
 */
export type OpenApiRouteMeta = {
  /** Short summary of what the route does. */
  summary?: string;
  /** Detailed description of the route. */
  description?: string;
  /** Tags for grouping routes in the OpenAPI UI. */
  tags?: string[];
  /** Name of the schema representing this route's input. */
  schemaName?: string;
  /** Name of the schema representing the request body. */
  requestSchemaName?: string;
  /** Zod schema for the response body. */
  responseSchema?: ZodSchema;
  /** Map of HTTP status codes to response definitions. */
  responses?: Record<number, { description: string; schema?: ZodSchema }>;
};

/**
 * Normalized request context passed to route handlers and authorization functions.
 */
export type RequestContext = {
  /** HTTP method in lowercase. */
  method: 'get' | 'post' | 'put' | 'patch' | 'delete' | 'head' | 'options';
  /** URL path of the request. */
  path: string;
  /** Request headers, with support for multi-value headers. */
  headers: Record<string, string | string[]>;
  /** Path parameters extracted from the route pattern. */
  params: Record<string, string>;
  /** Query string parameters, with support for multi-value params. */
  query: Record<string, string | string[]>;
  /** Request body (available for POST, PUT, PATCH). */
  body?: unknown;
};

/**
 * Context about the response, passed to the onResponse observability hook.
 */
export type ResponseContext = {
  /** HTTP status code of the response. */
  statusCode: number;
  /** Time in milliseconds from request start to response. */
  durationMs: number;
  /** Error thrown during request processing, if any. */
  error?: Error;
};

/**
 * Logging interface for observability.
 */
export type Logger = {
  /** Log a debug-level message. */
  debug: (...args: unknown[]) => void;
  /** Log an error-level message. */
  error: (...args: unknown[]) => void;
  /** Log an info-level message. */
  info: (...args: unknown[]) => void;
  /** Log a warning-level message. */
  warn: (...args: unknown[]) => void;
};

/**
 * Handler function for API routes.
 * @typeParam TClaims - The type of the decoded JWT claims object.
 * @typeParam TBody - The type of the request body.
 */
export type ApiRouteHandler<TClaims, TBody = unknown> = (
  /** Request context including path, method, headers, params, query, and body. */
  ctx: RequestContext & { body: TBody },
  /** Decoded JWT claims from the request (undefined if not authenticated). */
  claims: TClaims | undefined,
  /** Logger instance for recording observability events. */
  logger: Logger,
) => Promise<unknown>;

/**
 * Authorization function that determines if a request should be allowed.
 * @typeParam TClaims - The type of the decoded JWT claims object.
 */
export type AuthorizeFn<TClaims> = (
  /** Normalized request context. */
  ctx: RequestContext,
  /** Decoded JWT claims from the request (undefined if not authenticated). */
  claims: TClaims | undefined,
  /** Logger instance for recording authorization decisions. */
  logger: Logger,
) => boolean | Promise<boolean>;

/**
 * Transform function for proxy route request modification.
 * Allows transforming the request body and headers before forwarding.
 */
export type TransformFn = (request: {
  /** Request body to transform. */
  body: unknown;
  /** Request headers to transform. */
  headers: Record<string, string>;
}) => {
  /** Transformed request body. */
  body: unknown;
  /** Transformed request headers. */
  headers: Record<string, string>;
};

/**
 * Configuration for SPA (Single Page Application) hosting.
 * The spa.root property is required; all other properties have sensible defaults.
 */
export type SpaConfig = {
  /**
   * URL prefix that should return 404 instead of the SPA fallback.
   * Defaults to '/api'.
   */
  apiPrefix?: string;
  /**
   * Fallback file to serve when no route matches (for SPA client-side routing).
   * Defaults to 'index.html'.
   */
  fallback?: string;
  /**
   * Name used in log messages to identify this server instance.
   * Defaults to 'app'.
   */
  name?: string;
  /**
   * Port number to listen on. Defaults to 3553.
   */
  port?: number;
  /**
   * Root directory containing the SPA static files. This is required.
   */
  root: string;
};

/**
 * Configuration for observability features: logging, request IDs, and lifecycle hooks.
 * @typeParam TClaims - The type of the decoded JWT claims object.
 */
export type ObservabilityConfig<TClaims = unknown> = {
  /**
   * Enable x-request-id header propagation. If an incoming request has an
   * x-request-id header, it is reused; otherwise a new UUID is generated.
   * Defaults to false.
   */
  requestId?: boolean;
  /**
   * Logger instance. If not provided, a noop logger is used.
   */
  logger?: Logger;
  /**
   * Hook called before each request is handled. Use for logging, metrics, or request tracing.
   */
  onRequest?: (
    /** Normalized request context. */
    ctx: RequestContext,
    /** Decoded JWT claims, if authenticated. */
    claims: TClaims | undefined,
    /** Logger instance. */
    logger: Logger,
  ) => void | Promise<void>;
  /**
   * Hook called after each response is sent. Use for logging response times and status codes.
   */
  onResponse?: (
    /** Normalized request context. */
    ctx: RequestContext,
    /** Decoded JWT claims, if authenticated. */
    claims: TClaims | undefined,
    /** Response context including status code and duration. */
    response: ResponseContext,
    /** Logger instance. */
    logger: Logger,
  ) => void | Promise<void>;
};

/**
 * OpenAPI/Scalar UI configuration options.
 */
export type OpenApiOptions = {
  /** Title shown in the OpenAPI UI. Defaults to 'Halide API'. */
  title?: string;
  /** API version shown in the OpenAPI UI. Defaults to '1.0.0'. */
  version?: string;
  /** Description shown in the OpenAPI UI. */
  description?: string;
  /** Array of server URLs to show in the OpenAPI UI. */
  servers?: Array<{ url: string; description?: string }>;
};

/**
 * CORS (Cross-Origin Resource Sharing) configuration.
 */
export type CorsConfig = {
  /** Headers that are allowed in requests (sent in Access-Control-Allow-Headers). */
  allowedHeaders?: string[];
  /** Whether to allow credentials (cookies, authorization headers). Cannot be true with wildcard origin. */
  credentials?: boolean;
  /** Headers exposed to the client (sent in Access-Control-Expose-Headers). */
  exposedHeaders?: string[];
  /** How long (seconds) the browser can cache preflight responses. */
  maxAge?: number;
  /** HTTP methods allowed for CORS. Defaults to GET, POST, PUT, DELETE, PATCH. */
  methods?: Array<'get' | 'post' | 'put' | 'delete' | 'patch' | 'head' | 'options'>;
  /** Allowed origins. Use '*' for any origin (incompatible with credentials: true). */
  origin?: string | string[];
};

/**
 * Authentication configuration for securing routes.
 */
export type SecurityAuthConfig = {
  /**
   * Expected JWT 'aud' (audience) claim. If provided, the JWT must contain
   * this audience or it will be rejected.
   */
  audience?: string;
  /** JWKS endpoint URL (required when strategy is 'jwks'). */
  jwksUri?: string;
  /**
   * Authentication strategy.
   * - 'bearer' — HS256 JWT via hono/jwt with a shared secret.
   * - 'jwks' — RS256 JWT via hono/jwk with a JWKS endpoint.
   * Defaults to 'bearer'.
   */
  strategy?: 'bearer' | 'jwks';
  /**
   * Function that returns the JWT signing secret. Can return a string
   * synchronously or a Promise for async secret resolution (e.g., from a vault).
   */
  secret?: () => string | Promise<string>;
  /**
   * Time-to-live (seconds) for caching the resolved secret. Useful when
   * secret is an async function. Defaults to 60.
   */
  secretTtl?: number;
};

/**
 * Security configuration combining auth, CORS, CSP, and rate limiting.
 */
export type SecurityConfig = {
  /** Authentication configuration for JWT validation. */
  auth?: SecurityAuthConfig;
  /** CORS configuration for cross-origin requests. */
  cors?: CorsConfig;
  /** Content Security Policy configuration. */
  csp?: CspOptions;
  /** Rate limiting configuration. */
  rateLimit?: {
    /** Maximum requests allowed per window. Defaults to 100. */
    maxRequests?: number;
    /** Time window in milliseconds. Defaults to 900000 (15 minutes). */
    windowMs?: number;
  };
};

/**
 * OpenAPI/Scalar UI server configuration.
 */
export type OpenApiConfig = {
  /** Enable the OpenAPI/Scalar UI. Defaults to false. */
  enabled?: boolean;
  /** Path where the UI is served. Defaults to '/swagger'. */
  path?: string;
  /** OpenAPI specification options. See {@link OpenApiOptions}. */
  options?: OpenApiOptions;
};

/**
 * Complete configuration for a Halide server.
 * @typeParam TClaims - The type of the decoded JWT claims object.
 */
export type ServerConfig<TClaims = unknown> = {
  /** Observability configuration: logging, request IDs, and lifecycle hooks. */
  observability?: ObservabilityConfig<TClaims>;
  /** API route definitions. Each route maps a path+method to a handler function. */
  apiRoutes?: ApiRoute<TClaims, unknown>[];
  /** Proxy route definitions. Each route forwards requests to an upstream target. */
  proxyRoutes?: ProxyRoute<TClaims>[];
  /** Security configuration: auth, CORS, CSP, rate limiting. */
  security?: SecurityConfig;
  /** SPA hosting configuration. This is the only required config section. */
  spa: SpaConfig;
  /** OpenAPI/Scalar documentation UI configuration. */
  openapi?: OpenApiConfig;
};

/**
 * Definition of an API route that executes a handler function.
 * Created via the {@link apiRoute} factory function.
 * @typeParam TClaims - The type of the decoded JWT claims object.
 * @typeParam TBody - The type of the request body.
 */
export type ApiRoute<TClaims = unknown, TBody = unknown> = {
  /** Whether the route is public (no auth required) or private (requires valid JWT). */
  access: 'public' | 'private';
  /** HTTP method for this route. Defaults to GET. */
  method?: 'get' | 'post' | 'put' | 'patch' | 'delete';
  /** Whether to fire observability hooks for this route. Defaults to true. */
  observe?: boolean;
  /** URL path pattern for this route. Supports Hono-style path parameters like '/users/:id'. */
  path: string;
  /** Route type discriminator. Set automatically by {@link apiRoute}. */
  type: 'api';
  /** Authorization function called after JWT validation. */
  authorize?: AuthorizeFn<TClaims>;
  /** Handler function that processes the request and returns a response. */
  handler: ApiRouteHandler<TClaims, TBody>;
  /** Zod schema for validating the request body. */
  validationSchema?: ZodSchema<TBody>;
  /** OpenAPI/Scalar metadata for documentation. */
  openapi?: OpenApiRouteMeta;
};

/**
 * Definition of a proxy route that forwards requests to an upstream target.
 * Created via the {@link proxyRoute} factory function.
 * @typeParam TClaims - The type of the decoded JWT claims object.
 */
export type ProxyRoute<TClaims = unknown> = {
  /** Whether the route is public (no auth required) or private (requires valid JWT). */
  access: 'public' | 'private';
  /** HTTP methods this proxy route handles. At least one is required. */
  methods: Array<'get' | 'post' | 'put' | 'patch' | 'delete'>;
  /** Whether to fire observability hooks for this route. Defaults to true. */
  observe?: boolean;
  /** URL path pattern to match. Supports Hono-style path parameters and wildcards. */
  path: string;
  /** Override path to use when forwarding (e.g., '/api/*' → '/v1/*'). Defaults to path. */
  proxyPath?: string;
  /** Upstream target URL to forward requests to. Required. */
  target: string;
  /** Timeout in milliseconds for upstream requests. Defaults to 60000. */
  timeout?: number;
  /** Route type discriminator. Set automatically by {@link proxyRoute}. */
  type: 'proxy';
  /** Authorization function called after JWT validation. */
  authorize?: AuthorizeFn<TClaims>;
  /**
   * Function to extract identity headers from claims and add to the upstream request.
   * Useful for passing user ID or tenant info to the backend.
   */
  identity?: (ctx: RequestContext, claims: TClaims) => Record<string, string> | undefined;
  /** Transform function to modify the request body/headers before forwarding. */
  transform?: TransformFn;
  /** OpenAPI/Scalar metadata for documentation. */
  openapi?: OpenApiRouteMeta;
};

/**
 * Union type for any route (API or proxy).
 * @typeParam TClaims - The type of the decoded JWT claims object.
 * @typeParam TBody - The type of the request body (for API routes).
 */
export type Route<TClaims = unknown, TBody = unknown> =
  | ApiRoute<TClaims, TBody>
  | ProxyRoute<TClaims>;

/**
 * Input type for creating an API route via the factory function.
 * Omits 'type', 'authorize' (has default), and 'handler' (required).
 * @typeParam TClaims - The type of the decoded JWT claims object.
 * @typeParam TBody - The type of the request body.
 */
export type ApiRouteInput<TClaims, TBody = unknown> = Omit<
  ApiRoute<TClaims, TBody>,
  'type' | 'authorize' | 'handler'
> & {
  /** Handler function that processes the request and returns a response. */
  handler: ApiRouteHandler<TClaims, TBody>;
  /** Authorization function called after JWT validation. */
  authorize?: AuthorizeFn<TClaims>;
};

/**
 * Input type for creating a proxy route via the factory function.
 * Omits 'type' which is set automatically.
 * @typeParam TClaims - The type of the decoded JWT claims object.
 */
export type ProxyRouteInput<TClaims> = Omit<ProxyRoute<TClaims>, 'type'>;
