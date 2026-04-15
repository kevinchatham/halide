import type z from 'zod';
import type {
  ApiRouteSchema,
  BffConfigSchema,
  ProxyRouteSchema,
  ServerConfigSchema,
} from './schema';

export type BffConfig = z.infer<typeof BffConfigSchema>;
export type ServerConfig = z.infer<typeof ServerConfigSchema>;
export type SpaConfig = z.infer<typeof BffConfigSchema>['app']['spa'];
export type ProxyRoute = z.infer<typeof ProxyRouteSchema>;
export type ApiRoute = z.infer<typeof ApiRouteSchema>;
