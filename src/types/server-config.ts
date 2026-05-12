import type { ApiRoute, ProxyRoute } from './api';
import type { AppConfig, ObservabilityConfig, THalideApp } from './app';
import type { OpenApiConfig } from './openapi';
import type { SecurityConfig } from './security';

/**
 * Complete configuration for a Halide server.
 * @typeParam TApp - The bundled app context type combining claims and logger.
 */
export type ServerConfig<TApp = THalideApp> = {
  /** Observability configuration: logging, request IDs, and lifecycle hooks. */
  observability?: ObservabilityConfig<TApp>;
  /** API route definitions. Each route maps a path+method to a handler function. */
  apiRoutes?: ApiRoute<TApp, unknown, unknown>[];
  /** Proxy route definitions. Each route forwards requests to an upstream target. */
  proxyRoutes?: ProxyRoute<TApp>[];
  /** Security configuration: auth, CORS, CSP, rate limiting. */
  security?: SecurityConfig;
  /** App hosting configuration (static files and/or API backend). Optional when not serving static files. */
  app?: AppConfig;
  /** OpenAPI/Scalar documentation UI configuration. */
  openapi?: OpenApiConfig;
};
