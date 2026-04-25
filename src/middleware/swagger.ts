import { Scalar } from '@scalar/hono-api-reference';
import type { Hono } from 'hono';
import { openAPIRouteHandler } from 'hono-openapi';
import type { ServerConfig } from '../types';

export function createOpenApiRoutes<TClaims>(config: ServerConfig<TClaims>, app: Hono): void {
  const openapiConfig = config.openapi;
  if (!openapiConfig?.enabled) return;

  const swaggerPath = openapiConfig.path ?? '/swagger';
  const options = openapiConfig.options;

  app.get(
    `${swaggerPath}/openapi.json`,
    openAPIRouteHandler(app, {
      documentation: {
        info: {
          title: options?.title ?? 'Halide API',
          version: options?.version ?? '1.0.0',
          ...(options?.description && { description: options.description }),
        },
        ...(options?.servers?.length && { servers: options.servers }),
      },
    }),
  );

  app.get(
    swaggerPath,
    Scalar({
      agent: {
        disabled: true,
      },
      hideClientButton: true,
      mcp: {
        disabled: true,
      },
      showDeveloperTools: 'never',
      url: `${swaggerPath}/openapi.json`,
    }),
  );
}
