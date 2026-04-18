import type { RequestHandler } from 'express';
import helmet from 'helmet';
import { DEFAULTS } from '../config/defaults';
import type { CspOptions } from '../config/types';

type HelmetCspDirectives = NonNullable<
  Parameters<typeof helmet.contentSecurityPolicy>[0]
>['directives'];

export function createSecurityMiddleware(csp: CspOptions): RequestHandler {
  const directives = (csp.directives ?? DEFAULTS.csp.default) as HelmetCspDirectives;
  const helmetInstance = helmet({
    contentSecurityPolicy: {
      directives,
    },
  });
  return helmetInstance;
}
