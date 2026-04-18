import type z from 'zod';
import type {
  ApiRouteSchema,
  ObservabilityConfigSchema,
  ProxyRouteSchema,
  RequestContext,
  RequestContextSchema,
  SecurityConfigSchema,
  ServerConfigSchema,
  SpaConfigSchema,
} from './schema';

/**
 * Note on function type validation:
 * Zod validates function presence and arity at runtime via HandlerFunctionSchema, etc.
 * TypeScript enforces TClaims types at compile time via the intersection types below.
 * Generic type parameters are erased at runtime and not validated by Zod.
 */

export type ApiRouteHandler<TClaims> = (
  ctx: RequestContext,
  claims: TClaims | undefined
) => Promise<unknown>;
export type AuthorizeFn<TClaims> = (
  ctx: RequestContext,
  claims: TClaims | undefined
) => boolean | Promise<boolean>;
export type TransformFn = (response: {
  body: unknown;
  headers: Record<string, string>;
}) =>
  | { body: unknown; headers: Record<string, string> }
  | Promise<{ body: unknown; headers: Record<string, string> }>;

export type ServerConfig<TClaims> = z.infer<typeof ServerConfigSchema> & {
  routes?: Route<TClaims>[];
};
export type SpaConfig = z.infer<typeof SpaConfigSchema>;
export type ObservabilityConfig = z.infer<typeof ObservabilityConfigSchema>;
export type SecurityConfig = z.infer<typeof SecurityConfigSchema>;

export type ApiRoute<TClaims> = z.infer<typeof ApiRouteSchema> & {
  handler: ApiRouteHandler<TClaims>;
  authorize?: AuthorizeFn<TClaims>;
};

export type ProxyRoute<TClaims> = z.infer<typeof ProxyRouteSchema> & {
  identity?: (
    ctx: z.infer<typeof RequestContextSchema>,
    claims: TClaims
  ) => Record<string, string> | undefined;
  authorize?: AuthorizeFn<TClaims>;
  transform?: TransformFn;
};

export type Route<TClaims> = ApiRoute<TClaims> | ProxyRoute<TClaims>;

type ApiRouteInput<TClaims> = Omit<z.infer<typeof ApiRouteSchema>, 'type' | 'authorize'> & {
  handler: ApiRouteHandler<TClaims>;
  authorize?: AuthorizeFn<TClaims>;
};

type ProxyRouteInput<TClaims> = Omit<ProxyRoute<TClaims>, 'type'>;

/**
 * Helper for defining API routes with proper IntelliSense.
 * Automatically sets type: 'api' and provides correct property suggestions.
 */
export function apiRoute<TClaims>(route: ApiRouteInput<TClaims>): ApiRoute<TClaims> {
  return {
    ...route,
    type: 'api',
    authorize: route.authorize ?? (async () => true),
  } as ApiRoute<TClaims>;
}

/**
 * Helper for defining proxy routes with proper IntelliSense.
 * Automatically sets type: 'proxy' and provides correct property suggestions.
 */
export function proxyRoute<TClaims>(route: ProxyRouteInput<TClaims>): ProxyRoute<TClaims> {
  return {
    ...route,
    type: 'proxy',
    authorize: route.authorize ?? (async () => true),
  } as ProxyRoute<TClaims>;
}
