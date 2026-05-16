import { defaultAuthorize } from '../config/defaults';
import type { ApiRoute, ApiRouteInput, AuthorizeFn } from '../types/api';

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
