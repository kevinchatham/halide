import type { NextFunction, Request, RequestHandler, Response } from 'express';

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

export function createRequestIdMiddleware(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const requestId = (req.headers['x-request-id'] as string | undefined) ?? generateRequestId();
    req.requestId = requestId;
    res.setHeader('x-request-id', requestId);
    next();
  };
}

function generateRequestId(): string {
  return crypto.randomUUID();
}
