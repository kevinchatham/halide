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
 * Context about the response, passed to the {@link ObservabilityConfig.onResponse} hook.
 */
export type ResponseContext = {
  /** HTTP status code of the response. */
  statusCode: number;
  /** Time in milliseconds from request start to response. */
  durationMs: number;
  /** Error thrown during request processing, if any. */
  error?: Error;
  /** Response body, if available. */
  body?: unknown;
};

/**
 * Logging interface for observability.
 * @typeParam TLogScope - The type of the structured log scope object passed to each log method.
 */
export type Logger<TLogScope = unknown> = {
  /** Log a debug-level message. */
  debug: (scope: TLogScope, ...args: unknown[]) => void;
  /** Log an error-level message. */
  error: (scope: TLogScope, ...args: unknown[]) => void;
  /** Log an info-level message. */
  info: (scope: TLogScope, ...args: unknown[]) => void;
  /** Log a warning-level message. */
  warn: (scope: TLogScope, ...args: unknown[]) => void;
};

/**
 * Bundled app context type that combines claims and logger.
 * Passed to handlers instead of separate claims and logger parameters.
 *
 * @example
 * ```ts
 * type MyApp = THalideApp<UserClaims, { requestId: string }>;
 *
 * apiRoute({
 *   access: 'private',
 *   path: '/users',
 *   handler: async (ctx, app: MyApp) => {
 *     app.logger.info({ requestId: app.claims.sub }, 'fetching user');
 *   },
 * });
 * ```
 */
export type THalideApp<TClaims = unknown, TLogScope = unknown> = {
  /** Decoded JWT claims from the request (undefined if not authenticated). */
  claims: TClaims | undefined;
  /** Logger instance for recording observability events. */
  logger: Logger<TLogScope>;
};

/**
 * Configuration for app hosting (static files and/or API backend).
 * The app.root property is not required when using as a pure backend.
 */
export type AppConfig = {
  /**
   * URL prefix that should return 404 instead of the app fallback.
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
   */
  port?: number;
  /**
   * Root directory containing the app static files. Optional when not serving static files.
   * Can be an absolute path (e.g. '/var/www/app') or a relative path from the current working directory.
   */
  root?: string;
};

/**
 * Hono context variables used internally by Halide middleware.
 */
export type HalideVariables = { rawBody?: unknown };

/**
 * Configuration for observability features: logging, request IDs, and lifecycle hooks.
 * @typeParam TApp - The bundled app context type combining claims and logger.
 */
export type ObservabilityConfig<TApp = THalideApp> = {
  /**
   * Enable x-request-id header propagation. If an incoming request has an
   * x-request-id header, it is reused; otherwise a new UUID is generated.
   * Defaults to false.
   */
  requestId?: boolean;
  /**
   * Logger instance. If not provided, a styled default logger is used.
   */
  logger?: Logger<unknown>;
  /**
   * Maximum bytes to collect from proxy responses for observability logging.
   * The full response is always piped through unmodified; this only limits
   * what is captured for logging purposes. Defaults to 1024.
   */
  maxCollect?: number;
  /**
   * Hook called before each request is handled. Use for logging, metrics, or request tracing.
   */
  onRequest?: (
    /** Normalized request context. */
    ctx: RequestContext,
    /** Bundled app context with claims and logger. */
    app: TApp,
  ) => void | Promise<void>;
  /**
   * Hook called after each response is sent. Use for logging response times and status codes.
   */
  onResponse?: (
    /** Normalized request context. */
    ctx: RequestContext,
    /** Bundled app context with claims and logger. */
    app: TApp,
    /** Response context including status code and duration. */
    response: ResponseContext,
  ) => void | Promise<void>;
};
