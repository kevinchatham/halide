import { secureHeaders } from 'hono/secure-headers';
import { DEFAULTS } from '../config/defaults';
import type { CspOptions } from '../config/types';

export function createSecurityMiddleware(csp: CspOptions): ReturnType<typeof secureHeaders> {
  const directives = csp.directives ?? DEFAULTS.csp.default;
  return secureHeaders({
    contentSecurityPolicy: directives as never,
  });
}
