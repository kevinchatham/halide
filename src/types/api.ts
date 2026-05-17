import type { ZodSchema } from 'zod';
import type { HalideContext, RequestContext } from './app';

export type { HalideContext } from './app';

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
  /** Map of HTTP status codes to response definitions. */
  responses?: Record<number, { description: string; schema?: ZodSchema }>;
};

/**
 * Source of an OpenAPI specification document.
 */
export type OpenApiSource = {
  /** Path to a local OpenAPI JSON file, or a URL to fetch. */
  path: string;
};

/**
 * Definition of an API route that executes a handler function.
 * Created via the {@link apiRoute} factory function.
 * @typeParam TClaims - The type of the decoded JWT claims.
 * @typeParam TLogScope - The type of the structured log scope object.
 * @typeParam TBody - The type of the request body.
 * @typeParam TResponse - The type of the response body.
 */
export type ApiRoute<
  TClaims = unknown,
  TLogScope = unknown,
  TBody = unknown,
  TResponse = unknown,
> = {
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
  authorize?: AuthorizeFn<TClaims, TLogScope>;
  /** Handler function that processes the request and returns a response. */
  handler(
    ctx: RequestContext & { body: TBody },
    app: HalideContext<TClaims, TLogScope>,
  ): Promise<TResponse | Response>;
  /** Zod schema for validating the request body and documenting it in OpenAPI. */
  requestSchema?: ZodSchema<TBody>;
  /** Zod schema for documenting the response body in OpenAPI. */
  responseSchema?: ZodSchema<TResponse>;
  /** OpenAPI/Scalar metadata for documentation. */
  openapi?: OpenApiRouteMeta;
};

/**
 * Definition of a proxy route that forwards requests to an upstream target.
 * Created via the {@link proxyRoute} factory function.
 * @typeParam TClaims - The type of the decoded JWT claims.
 * @typeParam TLogScope - The type of the structured log scope object.
 */
export type ProxyRoute<TClaims = unknown, TLogScope = unknown> = {
  /** Whether the route is public (no auth required) or private (requires valid JWT). */
  access: 'public' | 'private';
  /** HTTP methods this proxy route handles. At least one is required. */
  methods: Array<'get' | 'post' | 'put' | 'patch' | 'delete' | 'head' | 'options'>;
  /** HTTP agent to use for upstream connections. Pass `http.Agent({ keepAlive: true })` for connection pooling. */
  agent?: import('node:http').Agent;
  /** Connection pool settings for the default agent. Applied when `agent` is not set. */
  connection?: {
    /** Maximum number of sockets per host. Default: 50. */
    maxSockets?: number;
    /** Maximum number of free sockets per host. Default: 10. */
    maxFreeSockets?: number;
  };
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
  authorize?: AuthorizeFn<TClaims, TLogScope>;
  /**
   * Function to extract identity headers from claims and add to the upstream request.
   * Useful for passing user ID or tenant info to the backend.
   */
  identity?: (
    ctx: RequestContext,
    app: HalideContext<TClaims, TLogScope>,
  ) => Record<string, string> | undefined;
  /** Transform function to modify the request body/headers before forwarding. */
  transform?: TransformFn;
  /**
   * Headers to forward to upstream. Defaults to a safe subset
   * (accept, accept-encoding, accept-language, cache-control, content-type,
   * origin, user-agent); omits authorization, cookie, and x-forwarded-for
   * headers. Set to an empty array `[]` to forward no headers at all.
   * When `trustedProxies` is configured, x-forwarded-for is forwarded only
   * if the immediate sender is a trusted proxy.
   */
  forwardHeaders?: string[];
  /** Trusted proxy IPs/CIDRs for x-forwarded-for header validation. */
  trustedProxies?: string[];
  /** OpenAPI/Scalar metadata for documentation. */
  openapi?: OpenApiRouteMeta;
  /** External OpenAPI spec source for documenting the proxied API. */
  openapiSpec?: OpenApiSource;
};

/**
 * Handler function for API routes.
 * @typeParam TClaims - The type of the decoded JWT claims.
 * @typeParam TLogScope - The type of the structured log scope object.
 * @typeParam TBody - The type of the request body.
 * @typeParam TResponse - The type of the response body.
 */
export type ApiRouteHandler<
  TClaims = unknown,
  TLogScope = unknown,
  TBody = unknown,
  TResponse = unknown,
> = (
  /** Request context including path, method, headers, params, query, and body. */
  ctx: RequestContext & { body: TBody },
  /** Bundled app context with claims and logger. */
  app: HalideContext<TClaims, TLogScope>,
) => Promise<TResponse | Response>;

/**
 * Authorization function that determines if a request should be allowed.
 * @typeParam TClaims - The type of the decoded JWT claims.
 * @typeParam TLogScope - The type of the structured log scope object.
 */
export type AuthorizeFn<TClaims = unknown, TLogScope = unknown> = (
  /** Normalized request context. */
  ctx: RequestContext,
  /** Bundled app context with claims and logger. */
  app: HalideContext<TClaims, TLogScope>,
) => boolean | Promise<boolean>;

/**
 * Transform function for proxy route request modification.
 * Allows transforming the request body and headers before forwarding.
 */
export type TransformFn = (request: {
  /** HTTP method in lowercase. */
  method: 'get' | 'post' | 'put' | 'patch' | 'delete' | 'head' | 'options';
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
 * Input type for creating an API route via the factory function.
 * Omits 'type', 'authorize' (has default), and 'handler' (required).
 * @typeParam TClaims - The type of the decoded JWT claims.
 * @typeParam TLogScope - The type of the structured log scope object.
 * @typeParam TBody - The type of the request body.
 * @typeParam TResponse - The type of the response body.
 */
export type ApiRouteInput<
  TClaims = unknown,
  TLogScope = unknown,
  TBody = unknown,
  TResponse = unknown,
> = Omit<ApiRoute<TClaims, TLogScope, TBody, TResponse>, 'type' | 'authorize' | 'handler'> & {
  /** Handler function that processes the request and returns a response. */
  handler: ApiRouteHandler<TClaims, TLogScope, TBody, TResponse>;
  /** Authorization function called after JWT validation. */
  authorize?: AuthorizeFn<TClaims, TLogScope>;
};

/**
 * Input type for creating a proxy route via the factory function.
 * Omits 'type' which is set automatically.
 * @typeParam TClaims - The type of the decoded JWT claims.
 * @typeParam TLogScope - The type of the structured log scope object.
 */
export type ProxyRouteInput<TClaims = unknown, TLogScope = unknown> = Omit<
  ProxyRoute<TClaims, TLogScope>,
  'type'
>;
