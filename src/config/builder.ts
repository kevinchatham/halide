import { apiRoute } from '../routes/api.route';
import { proxyRoute } from '../routes/proxy.route';
import type { ApiRoute, ApiRouteInput, ProxyRoute, ProxyRouteInput } from '../types/api';
import type { ServerConfig } from '../types/server-config';
import type { CreateAppResult, Server } from './runtime';
import { createApp, createServer } from './runtime';

type HalideBuilder<TClaims, TLogScope> = {
  apiRoute: <TBody = unknown, TResponse = unknown>(
    route: ApiRouteInput<TClaims, TLogScope, TBody, TResponse>,
  ) => ApiRoute<TClaims, TLogScope, TBody, TResponse>;
  createApp: (config: ServerConfig<TClaims, TLogScope>) => CreateAppResult;
  createServer: (config: ServerConfig<TClaims, TLogScope>) => Server;
  proxyRoute: (route: ProxyRouteInput<TClaims, TLogScope>) => ProxyRoute<TClaims, TLogScope>;
};

/**
 * Builder factory that pre-bakes `TClaims` and `TLogScope` so callers only
 * specify body types per route.
 *
 * @typeParam TClaims - The type of the decoded JWT claims.
 * @typeParam TLogScope - The type of the structured log scope object.
 * @returns An object with `apiRoute`, `proxyRoute`, `createApp`, and `createServer`.
 * @example
 * ```ts
 * const { apiRoute, createServer } = defineHalide<UserClaims, LogScope>();
 *
 * const server = createServer({
 *   apiRoutes: [
 *     apiRoute<{ name: string }, { id: string }>({ ... }),
 *   ],
 * });
 * ```
 */
export function defineHalide<TClaims = unknown, TLogScope = unknown>(): HalideBuilder<
  TClaims,
  TLogScope
> {
  return {
    apiRoute: <TBody = unknown, TResponse = unknown>(
      route: ApiRouteInput<TClaims, TLogScope, TBody, TResponse>,
    ): ApiRoute<TClaims, TLogScope, TBody, TResponse> =>
      apiRoute<TClaims, TLogScope, TBody, TResponse>(route),

    createApp: (config: ServerConfig<TClaims, TLogScope>): CreateAppResult =>
      createApp<TClaims, TLogScope>(config),

    createServer: (config: ServerConfig<TClaims, TLogScope>): Server =>
      createServer<TClaims, TLogScope>(config),

    proxyRoute: (route: ProxyRouteInput<TClaims, TLogScope>): ProxyRoute<TClaims, TLogScope> =>
      proxyRoute<TClaims, TLogScope>(route),
  };
}
