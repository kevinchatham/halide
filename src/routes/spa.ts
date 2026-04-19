import path from 'node:path';
import express, {
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from 'express';
import { DEFAULTS } from '../config/defaults';
import type { SpaConfig } from '../config/types';

export function createSpaHandler(spaConfig: NonNullable<SpaConfig>): RequestHandler[] {
  const { apiPrefix = DEFAULTS.spa.apiPrefix, root, fallback = DEFAULTS.spa.fallback } = spaConfig;
  const fallbackPath = path.join(root, fallback);

  const staticMiddleware = express.static(root);

  const spaFallback: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
    if (apiPrefix && req.path.startsWith(apiPrefix)) {
      res.status(404).json({ error: 'Not Found' });
      return;
    }
    res.sendFile(fallbackPath, (err) => {
      if (err) {
        next(err);
      }
    });
  };

  return [staticMiddleware, spaFallback];
}
