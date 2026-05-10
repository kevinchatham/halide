import { Hono } from 'hono';
import { createNoopLogger } from '../config/defaults';
import { createOpenApiRoutes } from '../middleware/swagger';
import type { ServerConfig } from '../types';
import type { Logger } from '../types/app';
import { registerRoutes, resolveOpenApiSpec } from './registry';

export const noopLogger: Logger<unknown> = createNoopLogger();

export type HalideVariables = { rawBody?: unknown };

export function createTestApp(config: ServerConfig): Hono<{ Variables: HalideVariables }> {
  const app = new Hono<{ Variables: HalideVariables }>();
  registerRoutes(app, config, noopLogger);
  createOpenApiRoutes(config, app as unknown as Hono);
  return app;
}

export { resolveOpenApiSpec };
