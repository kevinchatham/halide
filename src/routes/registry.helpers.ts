import { Hono } from 'hono';
import { createNoopLogger } from '../config/defaults';
import { createOpenApiRoutes } from '../middleware/swagger';
import type { ServerConfig } from '../types';
import type { Logger } from '../types/app';
import { registerRoutes } from './registry';

export { resolveOpenApiSpec } from './registry';

/** Logger instance that discards all log messages, used for testing. */
export const noopLogger: Logger<unknown> = createNoopLogger();

/** Hono variables type for storing raw request body during testing. */
export type HalideVariables = { rawBody?: unknown };

/**
 * Create a Hono application configured with routes and OpenAPI routes for testing.
 *
 * Registers all routes from config and adds OpenAPI documentation routes.
 * Uses a noop logger so tests don't produce log output.
 *
 * @param config - The server configuration containing routes.
 * @returns A Hono app with routes registered but not started.
 */
export function createTestApp(config: ServerConfig): Hono<{ Variables: HalideVariables }> {
  const app = new Hono<{ Variables: HalideVariables }>();
  registerRoutes(app, config, noopLogger);
  createOpenApiRoutes(config, app as unknown as Hono);
  return app;
}
