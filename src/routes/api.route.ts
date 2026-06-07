import { defaultAuthorize } from '../config/defaults';
import type { ApiRoute, ApiRouteInput, AuthorizeFn } from '../types/api';

/**
 * Create an API route definition, filling in `type: 'api'` and a default
 * `authorize` function that accepts any valid JWT.
 *
 * The factory lets you omit `type` (set to `'api'` automatically) and
 * `authorize` (defaults to {@link defaultAuthorize}, which accepts any
 * authenticated user). Provide your own `authorize` to restrict access
 * by role, claim values, or other criteria.
 *
 * @typeParam TClaims - The type of the decoded JWT claims.
 * @typeParam TLogScope - The type of the structured log scope object.
 * @typeParam TBody - The type of the request body.
 * @typeParam TResponse - The type of the response body.
 * @param route - The route input, omitting `type` and `handler`.
 * @returns A fully-typed {@link ApiRoute} definition.
 */
export function apiRoute<
  TClaims = unknown,
  TLogScope = unknown,
  TBody = unknown,
  TResponse = unknown,
>(
  route: ApiRouteInput<TClaims, TLogScope, TBody, TResponse>,
): ApiRoute<TClaims, TLogScope, TBody, TResponse> {
  return {
    ...route,
    authorize: (route.authorize ?? defaultAuthorize) as AuthorizeFn<TClaims, TLogScope>,
    type: 'api',
  };
}
