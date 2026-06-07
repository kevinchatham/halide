import { defaultAuthorize } from '../config/defaults';
import type { AuthorizeFn, ProxyRoute, ProxyRouteInput } from '../types/api';

/**
 * Create a proxy route definition, filling in `type: 'proxy'` and a default
 * `authorize` function that accepts any valid JWT.
 *
 * The factory lets you omit `type` (set to `'proxy'` automatically) and
 * `authorize` (defaults to {@link defaultAuthorize}, which accepts any
 * authenticated user). Provide your own `authorize` to restrict access
 * by role, claim values, or other criteria.
 *
 * @typeParam TClaims - The type of the decoded JWT claims.
 * @typeParam TLogScope - The type of the structured log scope object.
 * @param route - The proxy route input, omitting `type`.
 * @returns A fully-typed {@link ProxyRoute} definition.
 */
export function proxyRoute<TClaims = unknown, TLogScope = unknown>(
  route: ProxyRouteInput<TClaims, TLogScope>,
): ProxyRoute<TClaims, TLogScope> {
  return {
    ...route,
    authorize: (route.authorize ?? defaultAuthorize) as AuthorizeFn<TClaims, TLogScope>,
    type: 'proxy',
  };
}
