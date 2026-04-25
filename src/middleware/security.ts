import { secureHeaders } from 'hono/secure-headers';
import { DEFAULTS } from '../config/defaults';
import type { CspDirectives, CspOptions } from '../types';

export function createSecurityMiddleware(
  csp: CspOptions,
  overrides?: Partial<CspDirectives>,
): ReturnType<typeof secureHeaders> {
  const base = csp.directives ?? DEFAULTS.csp.default;
  const directives = overrides ? { ...base, ...overrides } : base;
  return secureHeaders({
    contentSecurityPolicy: directives as never,
  });
}
