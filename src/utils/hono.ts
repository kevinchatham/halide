import { Hono } from 'hono';
import type { BlankSchema } from 'hono/types';
import type { HalideVariables, HonoApp } from '../types/app';

/**
 * Build a new Hono application with {@link HalideVariables}.
 *
 * Creates a Hono app typed with {@link HalideVariables} so that middleware
 * can store and retrieve parsed bodies (`parsedBody`), app contexts (`appCtx`),
 * and request contexts (`reqCtx`). Used internally for creating temporary
 * apps (e.g., for OpenAPI spec generation).
 *
 * @returns A new Hono app instance.
 */
export function buildHonoApp(): HonoApp {
  return new Hono<
    {
      Variables: HalideVariables;
    },
    BlankSchema,
    '/'
  >();
}
