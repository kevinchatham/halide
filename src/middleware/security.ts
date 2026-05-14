import { secureHeaders } from 'hono/secure-headers';
import { DEFAULTS } from '../config/defaults';
import type { CspDirectives } from '../types/csp';

/**
 * Create middleware that applies Content Security Policy headers.
 *
 * `hono/secure-headers` internally converts camelCase directive keys
 * (e.g. `defaultSrc`) to kebab-case (`default-src`) for the HTTP header.
 * No manual conversion is needed.
 *
 * @param csp - CSP directives to apply. Falls back to defaults when empty.
 * @param overrides - Optional overrides for specific directives (used for OpenAPI UI).
 * @returns A Hono middleware handler for CSP.
 */
export function createSecurityMiddleware(
  csp: CspDirectives,
  overrides?: Partial<CspDirectives>,
): ReturnType<typeof secureHeaders> {
  const base = Object.keys(csp).length > 0 ? csp : DEFAULTS.csp.default;
  const directives = overrides ? { ...base, ...overrides } : base;
  return secureHeaders({
    contentSecurityPolicy: directives as CspDirectives,
  });
}
