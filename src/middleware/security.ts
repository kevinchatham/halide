import type { RequestHandler } from 'express';
import helmet from 'helmet';
import { DEFAULTS } from '../config/defaults';

type CspConfig = Record<string, string[]>;

export function createSecurityMiddleware(csp: CspConfig): RequestHandler {
  return (req, res, next) => {
    const helmetConfig: Parameters<typeof helmet>[0] = {
      contentSecurityPolicy: {
        directives: Object.keys(csp).length > 0 ? csp : DEFAULTS.csp.default,
      },
    };

    const helmetInstance = helmet(helmetConfig);
    helmetInstance(req, res, next);
  };
}
