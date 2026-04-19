import type { ErrorRequestHandler } from 'express';
import type { Logger } from '../config/types';

export function createErrorHandler(logger: Logger): ErrorRequestHandler {
  return (err, req, res, _next) => {
    logger.error(`[error] ${req.method} ${req.path}:`, err);
    res.locals.error = err instanceof Error ? err : new Error(String(err));
    res.status(500).json({ error: 'Internal Server Error' });
  };
}
