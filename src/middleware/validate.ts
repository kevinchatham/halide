import type { RequestHandler } from 'express';
import type { ZodSchema } from 'zod';

export function createBodyValidationMiddleware(schema: ZodSchema): RequestHandler {
  return (req, res, next) => {
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
