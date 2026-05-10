import { Scalar } from '@scalar/hono-api-reference';
import type { Hono } from 'hono';
import { openAPIRouteHandler } from 'hono-openapi';
import { resolveOpenApiSpec } from '../routes/registry';
import type { ServerConfig } from '../types';
import type { ProxyRoute } from '../types/api';
import type { OpenApiOptions } from '../types/openapi';

/** Allowed HTTP methods for OpenAPI operations. */
const ALLOWED_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

/** Merge metadata overrides (summary, description, tags) onto an OpenAPI operation object. */
function applyMetadata(
  operation: Record<string, unknown>,
  metadata: ProxyRoute<unknown>['openapi'],
): void {
  if (metadata?.summary) operation.summary = metadata.summary;
  if (metadata?.description) operation.description = metadata.description;
  if (metadata?.tags?.length) operation.tags = metadata.tags;
}

/** Merge external OpenAPI spec paths into the inline spec's paths map. */
function mergeExternalSpecs(
  inlineSpec: Record<string, unknown>,
  resolvedSpecs: Array<{ spec: Record<string, unknown>; route: ProxyRoute<unknown> }>,
): Record<string, unknown> {
  const paths = (inlineSpec['paths'] as Record<string, unknown>) ?? {};

  for (const { spec, route } of resolvedSpecs) {
    const externalPaths = (spec['paths'] as Record<string, unknown>) ?? {};
    const metadata = route.openapi;
    const mappedPath = route.path.replace(/\*$/, '');
    const routeMethods = route.methods.map((m) => m.toUpperCase());

    for (const [_externalPath, externalPathItem] of Object.entries(externalPaths)) {
      const pathItem = externalPathItem as Record<string, unknown>;
      mergePathItem(pathItem, mappedPath, routeMethods, metadata, paths);
    }
  }

  return { ...inlineSpec, paths };
}

/** Merge a single path item from an external spec into the paths map. */
function mergePathItem(
  pathItem: Record<string, unknown>,
  mappedPath: string,
  routeMethods: string[],
  metadata: ProxyRoute<unknown>['openapi'],
  paths: Record<string, unknown>,
): void {
  for (const [method, operation] of Object.entries(pathItem)) {
    const upperMethod = method.toUpperCase();
    if (!ALLOWED_METHODS.has(upperMethod)) continue;
    if (!routeMethods.includes(upperMethod)) continue;

    const mergedOperation = { ...(operation as Record<string, unknown>) };
    applyMetadata(mergedOperation, metadata);

    const pathKey = `${mappedPath}.${upperMethod.toLowerCase()}`;
    paths[pathKey] = mergedOperation;
  }
}

/** Build the inline OpenAPI spec by fetching from the Hono app's openAPIRouteHandler. */
function buildInlineSpec(
  app: Hono,
  options: OpenApiOptions | undefined,
  ctx: unknown,
): Promise<Record<string, unknown>> {
  const inlineHandler = openAPIRouteHandler(app, {
    documentation: {
      info: {
        title: options?.title ?? 'Halide API',
        version: options?.version ?? '1.0.0',
        ...(options?.description && { description: options.description }),
      },
      ...(options?.servers?.length && { servers: options.servers }),
    },
  });
  return (inlineHandler as unknown as (ctx: unknown) => Promise<Response>)(ctx).then(
    (res) => ((res as unknown as Response)?.json() as Promise<Record<string, unknown>>) ?? {},
  );
}

/** Build the final OpenAPI spec with title, version, description, and servers. */
function buildFinalSpec(
  mergedSpec: Record<string, unknown>,
  options: OpenApiOptions | undefined,
): Record<string, unknown> {
  const inlineInfo = mergedSpec['info'] as Record<string, string | undefined> | undefined;
  const info =
    options?.title || options?.version || options?.description
      ? {
          title: options?.title ?? inlineInfo?.title ?? 'Halide API',
          version: options?.version ?? inlineInfo?.version ?? '1.0.0',
          ...(options?.description && { description: options.description }),
          ...(!options?.description &&
            inlineInfo?.description && {
              description: inlineInfo.description,
            }),
        }
      : inlineInfo;
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
 * @typeParam TApp - The bundled app context type combining claims and logger.
 * @param config - The server configuration containing OpenAPI settings.
 * @param app - The Hono application to register documentation routes on.
 */
export function createOpenApiRoutes<TApp = unknown>(config: ServerConfig<TApp>, app: Hono): void {
  const openapiConfig = config.openapi;
  if (!openapiConfig?.enabled) return;

  const swaggerPath = openapiConfig.path ?? '/swagger';
  const options = openapiConfig.options;
  const proxyRoutes = config.proxyRoutes;
  const hasExternalSpecs = proxyRoutes?.some((r) => r.openapiSpec) ?? false;

  if (hasExternalSpecs) {
    let cachedSpec: Record<string, unknown> | null = null;
    let specResolution: Promise<void> | null = null;

    app.get(`${swaggerPath}/openapi.json`, async (c) => {
      if (cachedSpec) {
        return c.json(cachedSpec);
      }

      specResolution ??= (async () => {
        try {
          const inlineSpec = await buildInlineSpec(app, options, c);
          const resolved = await resolveOpenApiSpec(proxyRoutes as ProxyRoute<unknown>[]);
          const mergedSpec = mergeExternalSpecs(inlineSpec, resolved);
          cachedSpec = buildFinalSpec(mergedSpec, options);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          // biome-ignore lint/suspicious/noConsole: error logging for OpenAPI spec resolution
          console.error('Failed to resolve OpenAPI spec:', msg);
          cachedSpec = {} as Record<string, unknown>;
        }
      })();

      await specResolution;
      return c.json(cachedSpec);
    });
  } else {
    app.get(
      `${swaggerPath}/openapi.json`,
      openAPIRouteHandler(app, {
        documentation: {
          info: {
            title: options?.title ?? 'Halide API',
            version: options?.version ?? '1.0.0',
            ...(options?.description && { description: options.description }),
          },
          ...(options?.servers?.length && { servers: options.servers }),
        },
      }),
    );
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
