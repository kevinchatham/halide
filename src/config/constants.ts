/** Per-URI JWKS cache TTL in milliseconds (1 hour). */
export const JWKS_CACHE_TTL_MS = 3600_000;

/** Maximum number of cached JWKS middleware instances. */
export const MAX_JWK_CACHE = 100;

/** Maximum number of in-flight JWKS fetch/refresh locks. */
export const MAX_JWK_LOCKS = 100;

/** Maximum number of HTTP agent pool entries. */
export const MAX_AGENT_CACHE = 500;

/** Maximum number of entries in the claim extractor cache. */
export const MAX_EXTRACTOR_CACHE = 200;

/** Default maximum number of entries for the rate limit in-memory store. */
export const DEFAULT_MAX_ENTRIES = 10000;

/** Fetch timeout in milliseconds for external OpenAPI spec URLs. */
export const OPENAPI_FETCH_TIMEOUT_MS = 10_000;
