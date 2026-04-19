import type { ErrorRequestHandler } from 'express';

export function createErrorHandler(): ErrorRequestHandler {
  return (err, req, res, _next) => {
    console.error(`[error] ${req.method} ${req.path}:`, err);
    res.locals.error = err instanceof Error ? err : new Error(String(err));
    res.status(500).json({ error: 'Internal Server Error' });
  };
}
