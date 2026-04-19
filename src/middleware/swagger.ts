import type { Router } from 'express';
import { Router as createRouter } from 'express';
import swaggerUi from 'swagger-ui-express';
import type { ServerConfig } from '../config/types';
import { generateOpenApiSpec } from '../openapi/generator';
import type { OpenApiOptions } from '../openapi/types';

export function createSwaggerMiddleware<TClaims>(
  config: ServerConfig<TClaims>,
  options?: OpenApiOptions,
): Router {
  const spec = generateOpenApiSpec(config, options);
  const router = createRouter();

  router.get('/openapi.json', (_req, res) => {
    res.json(spec);
  });

  router.use('/', swaggerUi.serve);
  router.get('/', swaggerUi.setup(spec));

  return router;
}
