import path from 'node:path';
import type { RequestHandler } from 'express';
import type { SpaConfig } from '../config/types';

export function createSpaHandler(spaConfig: NonNullable<SpaConfig>): RequestHandler {
  const { root, fallback } = spaConfig;

  return (req, res) => {
    const requestPath = req.path;

    if (requestPath.startsWith('/api')) {
      res.status(404).json({ error: 'Not Found' });
      return;
    }

    const filePath = path.join(root, requestPath);
    res.sendFile(filePath, (err) => {
      if (err) {
        res.sendFile(path.join(root, fallback));
      }
    });
  };
}
