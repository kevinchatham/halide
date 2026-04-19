import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodSchema } from 'zod';

export function createBodyValidationMiddleware(schema: ZodSchema): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    if (
      req.method === 'GET' ||
      req.method === 'DELETE' ||
      req.method === 'HEAD' ||
      req.method === 'OPTIONS'
    ) {
      next();
      return;
    }
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json(parsed.error.issues);
      return;
    }
    req.body = parsed.data;
    next();
  };
}
