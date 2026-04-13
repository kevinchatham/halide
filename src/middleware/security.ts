import type { RequestHandler } from 'express';
import helmet from 'helmet';

export function createSecurityMiddleware(csp: 'strict' | 'relaxed'): RequestHandler {
  return (req, res, next) => {
    const helmetInstance = helmet({
      contentSecurityPolicy:
        csp === 'strict'
          ? {
              directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'"],
                scriptSrcAttr: ["'unsafe-inline'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                imgSrc: ["'self'"],
              },
            }
          : false,
    });
    helmetInstance(req, res, next);
  };
}
