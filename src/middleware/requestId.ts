import type { RequestHandler } from 'express';

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

export function createRequestIdMiddleware(): RequestHandler {
  return (req, res, next) => {
    const requestId = (req.headers['x-request-id'] as string | undefined) ?? generateRequestId();
    req.requestId = requestId;
    res.setHeader('x-request-id', requestId);
    next();
  };
}

function generateRequestId(): string {
  return crypto.randomUUID();
}
