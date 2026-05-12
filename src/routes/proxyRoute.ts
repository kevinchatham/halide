import { defaultAuthorize } from '../config/defaults';
import type { ProxyRoute, ProxyRouteInput } from '../types/api';

/**
 * Factory function to create a proxy route configuration.
 * Sets `type: 'proxy'` and provides a default authorize function.
 * @typeParam TApp - The bundled app context type combining claims and logger.
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
export function proxyRoute<TApp = unknown>(route: ProxyRouteInput<TApp>): ProxyRoute<TApp> {
  return {
    ...route,
    authorize: route.authorize ?? defaultAuthorize,
    type: 'proxy',
  };
}
