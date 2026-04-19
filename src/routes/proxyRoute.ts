import { defaultAuthorize } from '../config/defaults';
import type { ProxyRoute, ProxyRouteInput } from '../types';

export function proxyRoute<TClaims>(route: ProxyRouteInput<TClaims>): ProxyRoute<TClaims> {
  return {
    ...route,
    authorize: route.authorize ?? defaultAuthorize,
    type: 'proxy',
  };
}
