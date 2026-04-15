import { join } from 'node:path';
import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import { createBffMiddleware } from 'bspa';
import express from 'express';

const browserDistFolder = join(import.meta.dirname, '../browser');

const app = express();
const angularApp = new AngularNodeAppEngine();

const bffMiddleware = createBffMiddleware({
  app: { name: 'angular-ssg' },
  proxy: {
    basePath: '/api',
    routes: [
      { path: '/users', access: 'private', target: 'http://localhost:3000' },
      { path: '/products', access: 'private', target: 'http://localhost:3000' },
    ],
  },
  api: {
    basePath: '/bff',
    routes: [
      {
        path: '/config',
        access: 'public',
        handler: (_req, res) => {
          res.json({
            apiUrl: 'http://localhost:3000',
            environment: process.env['NODE_ENV'] || 'development',
          });
        },
      },
    ],
  },
  security: {
    cors: 'internal',
    csp: 'strict',
  },
  auth: {
    strategy: 'bearer',
    secret: 'a-string-secret-at-least-256-bits-long',
  },
});

app.use(bffMiddleware);

app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  })
);

app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) => (response ? writeResponseToNodeResponse(response, res) : next()))
    .catch(next);
});

if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 4001;
  app.listen(port, (error) => {
    if (error) {
      throw error;
    }

    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

export const reqHandler = createNodeRequestHandler(app);
