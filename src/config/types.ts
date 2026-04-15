import type z from 'zod';
import type { ApiRouteSchema, ProxyRouteSchema, ServerConfigSchema } from './schema';

export type ServerConfig = z.infer<typeof ServerConfigSchema>;
export type SpaConfig = ServerConfig['app']['spa'];
export type ProxyRoute = z.infer<typeof ProxyRouteSchema>;
export type ApiRoute = z.infer<typeof ApiRouteSchema>;
