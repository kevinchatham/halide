import { apiRoute } from '../routes/api.route';
import { proxyRoute } from '../routes/proxy.route';
import type { ApiRoute, ApiRouteInput, ProxyRoute, ProxyRouteInput } from '../types/api';
import type { ExtractClaims, ExtractLogScope, HalideContext } from '../types/app';
import type { ServerConfig } from '../types/server-config';
import type { CreateAppResult, Server } from './runtime';
import { createApp, createServer } from './runtime';

/** Builder object returned by {@link defineHalide}, pre-baked with extracted `TClaims` and `TLogScope` from `TApp`. */
type HalideBuilder<TApp> = {
  /** Factory for API routes with pre-baked claims and log scope types. */
  apiRoute: <TBody = unknown, TResponse = unknown>(
    route: ApiRouteInput<ExtractClaims<TApp>, ExtractLogScope<TApp>, TBody, TResponse>,
  ) => ApiRoute<ExtractClaims<TApp>, ExtractLogScope<TApp>, TBody, TResponse>;
  /** Builds a Hono app with registered routes (does not start a server). */
  createApp: (config: ServerConfig<ExtractClaims<TApp>, ExtractLogScope<TApp>>) => CreateAppResult;
  /** Creates a full server lifecycle wrapper around {@link createApp} with start/stop/ready. */
  createServer: (config: ServerConfig<ExtractClaims<TApp>, ExtractLogScope<TApp>>) => Server;
  /** Factory for proxy routes with pre-baked claims and log scope types. */
  proxyRoute: (
    route: ProxyRouteInput<ExtractClaims<TApp>, ExtractLogScope<TApp>>,
  ) => ProxyRoute<ExtractClaims<TApp>, ExtractLogScope<TApp>>;
};

/**
 * Builder factory that takes a {@link HalideContext} type and pre-bakes its
 * claims and log scope types so callers only specify body types per route.
 *
 * @typeParam TApp - A {@link HalideContext} type that defines claims and logger scope.
 * @returns An object with `apiRoute`, `proxyRoute`, `createApp`, and `createServer`.
 * @example
 * ```ts
 * type App = HalideContext<UserClaims, LogScope>;
 * const { apiRoute, createServer } = defineHalide<App>();
 *
 * const server = createServer({
 *   apiRoutes: [
 *     apiRoute<{ name: string }, { id: string }>({ ... }),
 *   ],
 * });
 * ```
 */
export function defineHalide<TApp = HalideContext>(): HalideBuilder<TApp> {
  type _TClaims = ExtractClaims<TApp>;
  type _TLogScope = ExtractLogScope<TApp>;

  return {
    apiRoute: <TBody = unknown, TResponse = unknown>(
      route: ApiRouteInput<_TClaims, _TLogScope, TBody, TResponse>,
    ): ApiRoute<_TClaims, _TLogScope, TBody, TResponse> =>
      apiRoute<_TClaims, _TLogScope, TBody, TResponse>(route),

    createApp: (config: ServerConfig<_TClaims, _TLogScope>): CreateAppResult =>
      createApp<_TClaims, _TLogScope>(config),

    createServer: (config: ServerConfig<_TClaims, _TLogScope>): Server =>
      createServer<_TClaims, _TLogScope>(config),

    proxyRoute: (route: ProxyRouteInput<_TClaims, _TLogScope>): ProxyRoute<_TClaims, _TLogScope> =>
      proxyRoute<_TClaims, _TLogScope>(route),
  };
}
