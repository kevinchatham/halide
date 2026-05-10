import type { Context } from 'hono';
import type { CspOptions } from './csp';

/**
 * Function that extracts JWT claims from a request context.
 * @typeParam TClaims - The type of the decoded JWT claims object.
 */
export type ClaimExtractor<TClaims = unknown> = (c: Context) => Promise<TClaims | null>;

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
