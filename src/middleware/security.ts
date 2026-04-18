import type { RequestHandler } from 'express';
import helmet from 'helmet';

type CspConfig = Record<string, string[]>;

export function createSecurityMiddleware(csp: CspConfig): RequestHandler {
  return (req, res, next) => {
    const helmetConfig: Parameters<typeof helmet>[0] = {
      contentSecurityPolicy: {
        directives:
          Object.keys(csp).length > 0
            ? csp
            : {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'"],
                scriptSrcAttr: ["'unsafe-inline'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                imgSrc: ["'self'"],
              },
      },
    };

    const helmetInstance = helmet(helmetConfig);
    helmetInstance(req, res, next);
  };
}
