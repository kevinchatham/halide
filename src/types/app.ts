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
 * Used as the generic constraint for route handlers and authorization functions.
 * @typeParam TClaims - The type of the decoded JWT claims.
 * @typeParam TLogScope - The type of the structured log scope object.
 */
export type HalideContext<TClaims = unknown, TLogScope = unknown> = {
  /** Decoded JWT claims from the request (undefined if not authenticated). */
  claims: TClaims | undefined;
  /** Logger instance for recording observability events. */
  logger: Logger<TLogScope>;
};

/**
 * Minimal constraint for type parameters that need to accept any HalideContext
 * variant without contravariance issues on Logger's type parameter.
 *
 * Uses `Logger<any>` because Logger is contravariant in TLogScope, which
 * prevents `HalideContext<UserClaims, LogScope>` from satisfying
 * `extends HalideContext<unknown, unknown>`. The `any` is intentional to
 * break contravariance at the constraint boundary.
 */
// biome-ignore lint/suspicious/noExplicitAny: required to accept any HalideContext variant
export type AnyHalideContext = { claims: unknown; logger: Logger<any> };

/** Extract the claims type from a context-like type. */
export type AppClaims<TApp> = TApp extends { claims: infer C } ? C : unknown;

/** Extract the logger type from a context-like type. */
export type AppLogger<TApp> = TApp extends { logger: Logger<infer S> }
  ? Logger<S>
  : Logger<unknown>;

/** Extract the log scope type from a context-like type. */
export type AppLogScope<TApp> = TApp extends { logger: Logger<infer S> } ? S : unknown;

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
export type HalideVariables = {
  parsedBody?: unknown;
  appCtx?: HalideContext;
  reqCtx?: RequestContext;
};

/**
 * Configuration for observability features: logging, request IDs, and lifecycle hooks.
 * @typeParam TApp - The bundled app context type combining claims and logger.
 */
export type ObservabilityConfig<TApp = HalideContext> = {
  /**
   * Enable x-request-id header propagation. If an incoming request has an
   * x-request-id header, it is reused; otherwise a new UUID is generated.
   * Defaults to false.
   */
  requestId?: boolean;
  /**
   * Logger instance. If not provided, a styled default logger is used.
   * The logger scope type is inferred from TApp's TLogScope parameter.
   */
  logger?: AppLogger<TApp>;
  /**
   * Factory that builds a typed log scope object for each request.
   * Receives the normalized request context and the bundled app context
   * (with claims and logger), and returns a TLogScope value that will be
   * automatically passed to every logger call within the request.
   *
   * This eliminates the need to manually construct and pass scope objects
   * in every `logger.info(scope, ...)` call — the framework does it for you.
   *
   * @example
   * ```ts
   * const server = createServer<HalideContext<UserClaims, { requestId: string }>>>({
   *   observability: {
   *     logScopeFactory: (ctx, app) => ({
   *       requestId: ctx.path,
   *       userId: app.claims?.sub ?? undefined,
   *     }),
   *   },
   * });
   * ```
   */
  logScopeFactory?: (ctx: RequestContext, app: TApp) => AppLogScope<TApp>;
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
