import { defaultAuthorize } from '../config/defaults';
import type { ApiRoute, ApiRouteInput } from '../types';

/**
 * Factory function to create an API route configuration.
 * Sets `type: 'api'` and provides a default authorize function.
 * @typeParam TApp - The bundled app context type combining claims and logger.
 * @typeParam TBody - The type of the request body.
 * @typeParam TResponse - The type of the response body.
 * @param route - The route input configuration.
 * @returns A complete ApiRoute object.
 * @example
 * ```ts
 * apiRoute({
 *   access: 'public',
 *   method: 'get',
 *   path: '/users/:id',
 *   handler: async (ctx, app) => { ... },
 * })
 * ```
 */
export function apiRoute<TApp, TBody = unknown, TResponse = unknown>(
  route: ApiRouteInput<TApp, TBody, TResponse>,
): ApiRoute<TApp, TBody, TResponse> {
  return {
    ...route,
    authorize: route.authorize ?? defaultAuthorize,
    type: 'api',
  };
}
