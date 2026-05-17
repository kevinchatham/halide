/** Per-URI JWKS cache TTL in milliseconds (1 hour). Used to cache fetched JWKS keys. */
export const JWKS_CACHE_TTL_MS = 3_600_000;

/** Maximum number of cached JWKS middleware instances. Old entries are evicted when exceeded. */
export const MAX_JWK_CACHE = 100;

/** Maximum number of in-flight JWKS fetch/refresh locks. Prevents concurrent fetches. */
export const MAX_JWK_LOCKS = 100;

/** Maximum number of HTTP agent pool entries. Old entries are evicted when exceeded. */
export const MAX_AGENT_CACHE = 500;

/** Default maximum number of entries for the rate limit in-memory store. */
export const DEFAULT_MAX_ENTRIES = 10000;

/** Fetch timeout in milliseconds for external OpenAPI spec URLs. */
export const OPENAPI_FETCH_TIMEOUT_MS = 10_000;

/** Default server port (3553). Overridden by the `PORT` environment variable. */
export const DEFAULT_PORT = 3553;

/** Default JWT secret cache TTL in seconds. Controls how long resolved secrets are cached. */
export const SECRET_CACHE_TTL_SECONDS = 60;

/** Default maximum number of free sockets per HTTP agent. */
export const DEFAULT_MAX_FREE_SOCKETS = 10;

/** Default maximum number of sockets per HTTP agent host. */
export const DEFAULT_MAX_SOCKETS = 50;

/** Default proxy timeout in milliseconds (10 seconds). Used when `route.timeout` is not set. */
export const DEFAULT_PROXY_TIMEOUT_MS = 10_000;

/** Default rate limit max requests per window (100 requests). */
export const DEFAULT_RATE_LIMIT_MAX_REQUESTS = 100;

/** Default rate limit window in milliseconds (15 minutes). */
export const DEFAULT_RATE_LIMIT_WINDOW_MS = 900_000;

/** Minimum rate limit store sweep interval in milliseconds (1 minute). */
export const MIN_SWEEP_INTERVAL_MS = 60_000;

/** Maximum rate limit store sweep interval in milliseconds (30 minutes). */
export const MAX_SWEEP_INTERVAL_MS = 1_800_000;

/** Default probe timeout in milliseconds (5 seconds). Used when probing upstream targets. */
export const DEFAULT_PROBE_TIMEOUT_MS = 5_000;

/** Default maximum bytes to collect for observability (1024 bytes). */
export const DEFAULT_MAX_COLLECT_BYTES = 1024;

/** Maximum bytes to collect for observability (1 MB). `maxCollect` cannot exceed this value. */
export const MAX_COLLECT_BYTES = 1024 * 1024;

/** Milliseconds per second (unit conversion). */
export const MILLIS_PER_SECOND = 1000;

/** Maximum time (ms) to wait for active requests to drain during graceful shutdown (30 seconds). */
export const MAX_DRAIN_TIMEOUT_MS = 30_000;
