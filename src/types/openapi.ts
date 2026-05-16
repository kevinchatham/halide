import type { ProxyRoute } from './api';

export type { OpenApiRouteMeta, OpenApiSource } from './api';

/**
 * Resolved OpenAPI specification document with its associated proxy route.
 * @typeParam TClaims - The type of the decoded JWT claims.
 * @typeParam TLogScope - The type of the structured log scope object.
 */
export type ResolvedOpenApiSpec<TClaims = unknown, TLogScope = unknown> = {
  /** The resolved OpenAPI spec as a plain object. */
  spec: Record<string, unknown>;
  /** The proxy route that owns this spec. */
  route: ProxyRoute<TClaims, TLogScope>;
};

/**
 * OpenAPI/Scalar UI specification options for customizing the generated documentation.
 */
export type OpenApiOptions = {
  /** Title shown in the OpenAPI UI. Defaults to 'Halide API'. */
  title?: string;
  /** API version shown in the OpenAPI UI. Defaults to '1.0.0'. */
  version?: string;
  /** Description shown in the OpenAPI UI. */
  description?: string;
  /** Server URLs and optional descriptions to display in the OpenAPI UI for try-it-out requests. */
  servers?: Array<{ url: string; description?: string }>;
};

/**
 * OpenAPI/Scalar UI server configuration.
 */
export type OpenApiConfig = {
  /** Enable the OpenAPI/Scalar UI. Defaults to false. */
  enabled?: boolean;
  /** Path where the UI is served. Defaults to '/swagger'. */
  path?: string;
  /** OpenAPI specification options. See {@link OpenApiOptions}. */
  options?: OpenApiOptions;
};
