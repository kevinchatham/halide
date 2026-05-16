import { Hono } from 'hono';
import type { BlankSchema } from 'hono/types';
import type { HalideVariables, HonoApp } from '../types/app';

export function buildHonoApp(): HonoApp {
  return new Hono<
    {
      Variables: HalideVariables;
    },
    BlankSchema,
    '/'
  >();
}
