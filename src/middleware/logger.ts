import type { RequestHandler } from 'express';

export function createLoggerMiddleware(name: string): RequestHandler {
  return (req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      console.log(`[${name}] ${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
    });
    next();
  };
}
