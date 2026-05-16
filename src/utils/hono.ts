import { Hono } from 'hono';
import type { BlankSchema } from 'hono/types';
import type { HalideVariables, HonoApp } from '../types/app';

/**
 * Build a new Hono application with Halide variables.
 *
 * Creates a Hono app typed with {@link HalideVariables} so that middleware
 * can store and retrieve parsed bodies, app contexts, and request contexts.
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
