import { defaultAuthorize } from '../config/defaults';
import type { ProxyRoute, ProxyRouteInput } from '../types';

/**
 * Factory function to create a proxy route configuration.
 * Sets `type: 'proxy'` and provides a default authorize function.
 * @typeParam TClaims - The type of the decoded JWT claims object.
 * @param route - The route input configuration.
 * @returns A complete ProxyRoute object.
 * @example
 * ```ts
 * proxyRoute({
 *   access: 'private',
 *   methods: ['get', 'post'],
 *   path: '/api/*',
 *   target: 'https://backend.example.com',
 * })
 * ```
 */
export function proxyRoute<TClaims>(route: ProxyRouteInput<TClaims>): ProxyRoute<TClaims> {
  return {
    ...route,
    authorize: route.authorize ?? defaultAuthorize,
    type: 'proxy',
  };
}
