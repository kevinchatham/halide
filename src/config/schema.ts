import type { Request, Response } from 'express';
import { z } from 'zod';

export const ProxyRouteSchema = z.object({
  path: z.string(),
  access: z.enum(['public', 'private']),
  target: z.string().url(),
});

export const ApiHandlerSchema = z
  .function()
  .args(z.custom<Request>(), z.custom<Response>())
  .returns(z.void());

export const ApiRouteSchema = z.object({
  path: z.string(),
  access: z.enum(['public', 'private']),
  handler: ApiHandlerSchema,
});

export const ProxyConfigSchema = z.object({
  basePath: z.string().default('/api'),
  routes: z.array(ProxyRouteSchema).default([]),
});

export const ApiConfigSchema = z.object({
  basePath: z.string().default('/bff'),
  routes: z.array(ApiRouteSchema).default([]),
});

const AppConfigBase = z.object({
  name: z.string().default('app'),
  spa: z
    .object({
      root: z.string(),
      basePath: z.string().default('/'),
      fallback: z.string().default('index.html'),
    })
    .optional(),
});

export const BffConfigSchema = z.object({
  app: AppConfigBase,
  proxy: ProxyConfigSchema.optional(),
  api: ApiConfigSchema.optional(),
  security: z
    .object({
      cors: z.enum(['internal', 'public']).default('internal'),
      csp: z.enum(['strict', 'relaxed']).default('strict'),
    })
    .optional(),
  auth: z
    .object({
      strategy: z.enum(['bearer', 'jwks']).default('bearer'),
      secret: z.string().min(1).optional(),
      jwksUri: z.string().url().optional(),
    })
    .refine((data) => data.strategy !== 'bearer' || data.secret !== undefined, {
      message: 'auth.secret is required when strategy is bearer',
      path: ['auth', 'secret'],
    }),
});

const SpaConfigSchema = z.object({
  root: z.string(),
  basePath: z.string().default('/'),
  fallback: z.string().default('index.html'),
});

const AppConfigServer = AppConfigBase.extend({
  spa: SpaConfigSchema,
});

export const ServerConfigSchema = BffConfigSchema.extend({
  app: AppConfigServer,
});
