import { defaultAuthorize } from '../config/defaults';
import type { ApiRoute, ApiRouteInput } from '../types';

export function apiRoute<TClaims, TBody = unknown>(
  route: ApiRouteInput<TClaims, TBody>,
): ApiRoute<TClaims, TBody> {
  return {
    ...route,
    authorize: route.authorize ?? defaultAuthorize,
    type: 'api',
  };
}
