import { Scalar } from '@scalar/hono-api-reference';
import type { Context } from 'hono';
import { openAPIRouteHandler } from 'hono-openapi';
import { asInternalLogger } from '../config/defaults';
import { resolveOpenApiSpec } from '../routes/registry.openapi';
import type { ProxyRoute } from '../types/api';
import type { HonoApp, Logger } from '../types/app';
import type { OpenApiOptions } from '../types/openapi';
import type { ServerConfig } from '../types/server-config';
import { buildHonoApp } from '../utils/hono';

/** Allowed HTTP methods that can appear in OpenAPI operation definitions. */
const ALLOWED_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Cached OpenAPI spec and shared resolution promise for concurrency guard.
 *
 * Used to prevent concurrent OpenAPI spec resolution requests by sharing
 * a single `specResolution` promise among all in-flight requests.
 * When a spec is being resolved, subsequent requests await the same promise.
 */
export interface SpecCacheState {
  /** The resolved OpenAPI spec, or `null` if not yet resolved. */
  cachedSpec: Record<string, unknown> | null;
  /** In-flight spec resolution promise, or `null` when no resolution is in progress. */
  specResolution: Promise<void> | null;
}

/**
 * Create a fresh spec cache state for isolation (used by tests).
 *
 * Returns a new `SpecCacheState` with null cache and resolution,
 * allowing tests to create independent caches.
 * @returns A new `SpecCacheState` with null cache and resolution.
 */
export function createSpecCacheState(): SpecCacheState {
  return { cachedSpec: null, specResolution: null };
}

/**
 * Reset the cached spec and resolution promise (used by tests).
 *
 * Clears both `cachedSpec` and `specResolution` so that the next
 * request triggers a fresh spec resolution.
 * @param state - The spec cache state to reset.
 */
export function resetOpenApiCache(state: SpecCacheState): void {
  state.cachedSpec = null;
  state.specResolution = null;
}

/**
 * Merge metadata overrides (summary, description, tags) from a proxy route
 * onto an OpenAPI operation object.
 *
 * @param operation - The OpenAPI operation object to modify in place.
 * @param metadata - Route-level OpenAPI metadata to merge.
 */
function applyMetadata<TClaims = unknown, TLogScope = unknown>(
  operation: Record<string, unknown>,
  metadata: ProxyRoute<TClaims, TLogScope>['openapi'],
): void {
  if (metadata?.summary) operation.summary = metadata.summary;
  if (metadata?.description) operation.description = metadata.description;
  if (metadata?.tags?.length) operation.tags = metadata.tags;
}

/**
 * Merge external OpenAPI spec paths into the inline spec's paths map,
 * respecting route method filtering and route-level metadata overrides.
 *
 * @param inlineSpec - The inline OpenAPI spec to merge into.
 * @param resolvedSpecs - External specs paired with their owning routes.
 * @returns The merged spec with external paths integrated.
 */
function mergeExternalSpecs<TClaims = unknown, TLogScope = unknown>(
  inlineSpec: Record<string, unknown>,
  resolvedSpecs: Array<{ spec: Record<string, unknown>; route: ProxyRoute<TClaims, TLogScope> }>,
): Record<string, unknown> {
  const paths = (inlineSpec['paths'] as Record<string, unknown>) ?? {};

  for (const { spec, route } of resolvedSpecs) {
    const externalPaths = (spec['paths'] as Record<string, unknown>) ?? {};
    const metadata = route.openapi;
    const routeMethods = route.methods.map((m) => m.toUpperCase());

    for (const [externalPath, externalPathItem] of Object.entries(externalPaths)) {
      const pathItem = externalPathItem as Record<string, unknown>;
      mergePathItem(externalPath, pathItem, routeMethods, metadata, paths);
    }
  }

  return { ...inlineSpec, paths };
}

/**
 * Merge a single path item from an external spec into the paths map,
 * filtering by allowed HTTP methods and applying route-level metadata.
 *
 * @param externalPath - The path key from the external spec.
 * @param pathItem - The path item object to merge.
 * @param routeMethods - HTTP methods allowed for this route.
 * @param metadata - Route-level OpenAPI metadata to apply.
 * @param paths - The paths map to merge into.
 */
function mergePathItem<TClaims = unknown, TLogScope = unknown>(
  externalPath: string,
  pathItem: Record<string, unknown>,
  routeMethods: string[],
  metadata: ProxyRoute<TClaims, TLogScope>['openapi'],
  paths: Record<string, unknown>,
): void {
  if (!(externalPath in paths)) {
    paths[externalPath] = {};
  }
  const pathObj = paths[externalPath] as Record<string, unknown>;

  for (const [method, operation] of Object.entries(pathItem)) {
    const upperMethod = method.toUpperCase();
    if (!ALLOWED_METHODS.has(upperMethod)) continue;
    if (!routeMethods.includes(upperMethod)) continue;

    const mergedOperation = { ...(operation as Record<string, unknown>) };
    applyMetadata(mergedOperation, metadata);
    pathObj[upperMethod.toLowerCase()] = mergedOperation;
  }
}

/**
 * Build the inline OpenAPI spec by creating a temporary Hono app and
 * fetching the OpenAPI route handler output.
 *
 * @param app - The Hono app to generate the spec for.
 * @param options - OpenAPI options (title, version, description, servers).
 * @returns The inline OpenAPI spec as a plain object.
 */
async function buildInlineSpec(
  app: HonoApp,
  options: OpenApiOptions | undefined,
): Promise<Record<string, unknown>> {
  const tempApp = buildHonoApp();
  const inlineHandler = openAPIRouteHandler as (
    app: HonoApp,
    opts: {
      documentation: {
        info: { title: string; version: string };
        description?: string;
        servers?: Array<{ url: string }>;
      };
    },
  ) => (ctx: unknown) => Promise<Response>;

  const handler = inlineHandler(app, {
    documentation: {
      info: {
        title: options?.title ?? 'Halide API',
        version: options?.version ?? '1.0.0',
        ...(options?.description && { description: options.description }),
      },
      ...(options?.servers?.length && { servers: options.servers }),
    },
  });

  const swaggerPath = '/__internal-spec';
  (tempApp.get as (path: string, ...handlers: Array<unknown>) => HonoApp)(
    `${swaggerPath}/openapi.json`,
    handler,
  );

  try {
    const res = await tempApp.fetch(new Request(`http://localhost${swaggerPath}/openapi.json`));
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * Build the final OpenAPI spec, merging title, version, description, and servers
 * from options while preferring options over inline spec defaults.
 *
 * @param mergedSpec - The spec after merging external paths.
 * @param options - OpenAPI options to apply.
 * @returns The final OpenAPI spec with resolved info.
 */
function buildFinalSpec(
  mergedSpec: Record<string, unknown>,
  options: OpenApiOptions | undefined,
): Record<string, unknown> {
  const inlineInfo = mergedSpec['info'] as Record<string, string | undefined> | undefined;
  const info = resolveOpenApiInfo(options, inlineInfo);
  return {
    ...mergedSpec,
    info,
    ...(options?.servers?.length && { servers: options.servers }),
  };
}

/**
 * Create OpenAPI/Scalar routes for API documentation.
 *
 * Registers the OpenAPI spec JSON endpoint and the Scalar UI page
 * on the provided Hono app. Does nothing if `config.openapi.enabled` is false.
 *
 * @typeParam TClaims - The type of the decoded JWT claims.
 * @typeParam TLogScope - The type of the structured log scope object.
 * @param config - The server configuration containing OpenAPI settings.
 * @param app - The Hono application to register documentation routes on.
 * @param state - The spec cache state instance for test isolation.
 */
export function createOpenApiRoutes<TClaims = unknown, TLogScope = unknown>(
  config: ServerConfig<TClaims, TLogScope>,
  app: HonoApp,
  state: SpecCacheState = createSpecCacheState(),
  logger?: Logger<TLogScope>,
): void {
  const openapiConfig = config.openapi;
  if (!openapiConfig?.enabled) return;

  const swaggerPath = openapiConfig.path ?? '/swagger';
  const options = openapiConfig.options;
  const proxyRoutes = config.proxyRoutes;
  const hasExternalSpecs = proxyRoutes?.some((r) => r.openapiSpec) ?? false;
  const il = logger ? asInternalLogger(logger) : undefined;

  if (hasExternalSpecs) {
    app.get(`${swaggerPath}/openapi.json`, async (c) => {
      if (state.cachedSpec) {
        return c.json(state.cachedSpec);
      }

      if (!state.specResolution) {
        state.specResolution = (async (): Promise<void> => {
          try {
            const inlineSpec = await buildInlineSpec(app, options);
            const resolvedSpecs = await resolveOpenApiSpec(proxyRoutes ?? []);
            const mergedSpec = mergeExternalSpecs(inlineSpec, resolvedSpecs);
            state.cachedSpec = buildFinalSpec(mergedSpec, options);
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            il?.error(
              { error: 'openapi_spec_resolution_failed' },
              `Failed to resolve OpenAPI spec: ${message}`,
            );
            state.specResolution = null;
          }
        })();
      }

      await state.specResolution;
      return c.json(state.cachedSpec ?? {});
    });
  } else {
    app.get(`${swaggerPath}/openapi.json`, ((c: Context) => {
      const handler = openAPIRouteHandler(app, {
        documentation: {
          info: {
            title: options?.title ?? 'Halide API',
            version: options?.version ?? '1.0.0',
            ...(options?.description && { description: options.description }),
          },
          ...(options?.servers?.length && { servers: options.servers }),
        },
      });
      return (handler as (ctx: unknown) => Promise<Response>)(c);
    }) as (c: Context) => Promise<Response>);
  }

  app.get(
    swaggerPath,
    Scalar({
      agent: {
        disabled: true,
      },
      hideClientButton: true,
      mcp: {
        disabled: true,
      },
      showDeveloperTools: 'never',
      url: `${swaggerPath}/openapi.json`,
    }),
  );
}

/**
 * Resolve OpenAPI info metadata, preferring options over inline defaults.
 *
 * When any of `title`, `version`, or `description` is provided in options,
 * builds a new info object with options taking priority over inline info.
 * Otherwise, passes through inline info as-is.
 *
 * @param options - OpenAPI options from config (title, version, description, servers).
 * @param inlineInfo - Inline info from the resolved OpenAPI spec.
 * @returns The resolved info object, or `undefined` if no info is available.
 */
export function resolveOpenApiInfo(
  options?: OpenApiOptions,
  inlineInfo?: Record<string, string | undefined>,
): Record<string, string | undefined> | undefined {
  if (options?.title || options?.version || options?.description) {
    const info: Record<string, string | undefined> = {
      title: options?.title ?? inlineInfo?.title ?? 'Halide API',
      version: options?.version ?? inlineInfo?.version ?? '1.0.0',
    };
    if (options?.description) {
      info.description = options.description;
    } else if (inlineInfo?.description) {
      info.description = inlineInfo.description;
    }
    return info;
  }
  return inlineInfo;
}
