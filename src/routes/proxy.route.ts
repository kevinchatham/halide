import { defaultAuthorize } from '../config/defaults';
import type { AuthorizeFn, ProxyRoute, ProxyRouteInput } from '../types/api';

export function proxyRoute<TClaims = unknown, TLogScope = unknown>(
  route: ProxyRouteInput<TClaims, TLogScope>,
): ProxyRoute<TClaims, TLogScope> {
  return {
    ...route,
    authorize: (route.authorize ?? defaultAuthorize) as AuthorizeFn<TClaims, TLogScope>,
    type: 'proxy',
  };
}
