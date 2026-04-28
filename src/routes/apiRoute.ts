import { defaultAuthorize } from '../config/defaults';
import type { ApiRoute, ApiRouteInput } from '../types';

/**
 * Factory function to create an API route configuration.
 * Sets `type: 'api'` and provides a default authorize function.
 * @typeParam TClaims - The type of the decoded JWT claims object.
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
 *   handler: async (ctx) => { ... },
 * })
 * ```
 */
export function apiRoute<TClaims, TBody = unknown, TResponse = unknown>(
  route: ApiRouteInput<TClaims, TBody, TResponse>,
): ApiRoute<TClaims, TBody, TResponse> {
  return {
    ...route,
    authorize: route.authorize ?? defaultAuthorize,
    type: 'api',
  };
}
