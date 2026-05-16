import type { Hono } from 'hono';
import type { BlankSchema } from 'hono/types';

/**
 * Hono application typed with {@link HalideVariables} for use throughout the framework.
 */
export type HonoApp = Hono<
  {
    Variables: HalideVariables;
  },
  BlankSchema,
  '/'
>;

/**
 * Normalized request context passed to route handlers and authorization functions.
 */
export type RequestContext = {
  /** HTTP method in lowercase (e.g., `'get'`, `'post'`). */
  method: 'get' | 'post' | 'put' | 'patch' | 'delete' | 'head' | 'options';
  /** URL path of the request (e.g., `/users/:id`). */
  path: string;
  /** Request headers, with support for multi-value headers (arrays for headers like `set-cookie`). */
  headers: Record<string, string | string[]>;
  /** Path parameters extracted from the Hono route pattern (e.g., `{ id: '42' }` for `/users/:id`). */
  params: Record<string, string>;
  /** Query string parameters, with support for multi-value params (arrays for repeated keys). */
  query: Record<string, string | string[]>;
  /** Request body (available for POST, PUT, PATCH). Parsed by body middleware or hono-openapi validator. */
  body?: unknown;
};

/**
 * Context about the response, passed to the {@link ObservabilityConfig.onResponse} hook.
 */
export type ResponseContext = {
  /** HTTP status code of the response (e.g., 200, 404, 500). */
  statusCode: number;
  /** Time in milliseconds from request start to response completion. */
  durationMs: number;
  /** Error thrown during request processing, if any. */
  error?: Error;
  /** Response body text, if collected (limited by `maxCollect` in {@link ObservabilityConfig}). */
  body?: unknown;
  /**
   * Indicates the format of the body field.
   * - 'text': body is a string (common for API responses, proxy body collection).
   * - 'binary': body may be raw bytes (e.g., image/png, application/octet-stream).
   * Binary body content collected through the proxy body collector is decoded as text
   * and may be garbled for non-text responses.
   * Undefined when no body was collected.
   */
  bodyType?: 'text' | 'binary';
};

/**
 * Internal logging interface for framework internals that log ad-hoc scope shapes
 * (e.g., validation errors, startup warnings, secret refresh failures).
 * Accepts `unknown` scope to allow arbitrary objects without requiring the
 * consumer's `TLogScope` type parameter.
 */
export type InternalLogger = {
  /** Log a debug-level message with arbitrary scope (e.g., validation errors, startup info). */
  debug: (scope: unknown, ...args: unknown[]) => void;
  /** Log an error-level message with arbitrary scope (e.g., middleware failures). */
  error: (scope: unknown, ...args: unknown[]) => void;
  /** Log an info-level message with arbitrary scope (e.g., server startup). */
  info: (scope: unknown, ...args: unknown[]) => void;
  /** Log a warning-level message with arbitrary scope (e.g., deprecated config). */
  warn: (scope: unknown, ...args: unknown[]) => void;
};

/**
 * Logging interface for observability.
 * @typeParam TLogScope - The type of the structured log scope object passed to each log method.
 */
export type Logger<TLogScope = unknown> = {
  /** Log a debug-level message with the typed log scope (e.g., request details). */
  debug: (scope: TLogScope, ...args: unknown[]) => void;
  /** Log an error-level message with the typed log scope (e.g., error details). */
  error: (scope: TLogScope, ...args: unknown[]) => void;
  /** Log an info-level message with the typed log scope (e.g., request lifecycle). */
  info: (scope: TLogScope, ...args: unknown[]) => void;
  /** Log a warning-level message with the typed log scope (e.g., deprecated usage). */
  warn: (scope: TLogScope, ...args: unknown[]) => void;
};

/**
 * Bundled app context type that combines claims and logger.
 * Used as the generic constraint for route handlers and authorization functions.
 * @typeParam TClaims - The type of the decoded JWT claims.
 * @typeParam TLogScope - The type of the structured log scope object.
 */
export type HalideContext<TClaims = unknown, TLogScope = unknown> = {
  /** Decoded JWT claims from the request (undefined if the request is unauthenticated or public). */
  claims: TClaims | undefined;
  /** Logger instance for recording observability events, scoped with per-request data when configured. */
  logger: Logger<TLogScope>;
};

/**
 * Hono context variables used internally by Halide middleware.
 */
export type HalideVariables = {
  /** Parsed request body, set by body parsing middleware (POST/PUT/PATCH). */
  parsedBody?: unknown;
  /** Bundled app context with claims and logger, set by context middleware. */
  appCtx?: HalideContext;
  /** Normalized request context, set by context middleware. */
  reqCtx?: RequestContext;
};

/**
 * Configuration for app hosting (static files and/or API backend).
 * The app.root property is not required when using as a pure backend.
 */
export type AppConfig = {
  /**
   * URL prefix that should return 404 instead of the app fallback.
   * Routes under this prefix (e.g., `/api/*`) are handled by API/proxy routes, not the SPA fallback.
   * Defaults to '/api'.
   */
  apiPrefix?: string;
  /**
   * Fallback file to serve when no route matches (for app client-side routing).
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
   * Can be overridden by the `PORT` environment variable.
   */
  port?: number;
  /**
   * Root directory containing the app static files. Optional when not serving static files.
   * Can be an absolute path (e.g. '/var/www/app') or a relative path from the current working directory.
   */
  root?: string;
};

/**
 * Configuration for observability features: logging, request IDs, and lifecycle hooks.
 * @typeParam TClaims - The type of the decoded JWT claims.
 * @typeParam TLogScope - The type of the structured log scope object.
 */
export type ObservabilityConfig<TClaims = unknown, TLogScope = unknown> = {
  /**
   * Enable x-request-id header propagation. If an incoming request has an
   * x-request-id header, it is reused; otherwise a new UUID is generated.
   * Defaults to false.
   */
  requestId?: boolean;
  /**
   * Logger instance. If not provided, a styled default logger is used
   * (colored in TTY, plain text otherwise).
   * The logger scope type is inferred from TLogScope.
   */
  logger?: Logger<TLogScope>;
  /**
   * Factory that builds a typed log scope object for each request.
   * Receives the normalized request context and the JWT claims (if authenticated),
   * and returns a TLogScope value that will be automatically passed to every
   * logger call within the request.
   *
   * This eliminates the need to manually construct and pass scope objects
   * in every `logger.info(scope, ...)` call — the framework does it for you.
   *
   * @example
   * ```ts
   * const server = createServer({
   *   observability: {
   *     logScopeFactory: (ctx, claims) => ({
   *       requestId: ctx.path,
   *       userId: claims?.sub ?? undefined,
   *     }),
   *   },
   * });
   * ```
   */
  logScopeFactory?: (ctx: RequestContext, claims: TClaims | undefined) => TLogScope;
  /**
   * Maximum bytes to collect from proxy responses for observability logging.
   * The full response is always piped through unmodified; this only limits
   * what is captured for logging purposes. Defaults to 1024.
   */
  maxCollect?: number;
  /**
   * Hook called before each request is handled. Use for logging, metrics, or request tracing.
   * Fired per-route unless `observe: false` is set on the route.
   */
  onRequest?: (
    /** Normalized request context with method, path, headers, params, query, and body. */
    ctx: RequestContext,
    /** Bundled app context with claims and logger. */
    app: HalideContext<TClaims, TLogScope>,
  ) => void | Promise<void>;
  /**
   * Hook called after each response is sent. Use for logging response times and status codes.
   * Fired per-route unless `observe: false` is set on the route.
   */
  onResponse?: (
    /** Normalized request context with method, path, headers, params, query, and body. */
    ctx: RequestContext,
    /** Bundled app context with claims and logger. */
    app: HalideContext<TClaims, TLogScope>,
    /** Response context including status code, duration, error, and body. */
    response: ResponseContext,
  ) => void | Promise<void>;
};
