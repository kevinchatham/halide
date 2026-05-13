import { Scalar } from '@scalar/hono-api-reference';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { openAPIRouteHandler } from 'hono-openapi';
import { resolveOpenApiSpec } from '../routes/registry.openapi';
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

/** Merge external OpenAPI spec paths into the inline spec's paths map, respecting route method filtering. */
function mergeExternalSpecs(
  inlineSpec: Record<string, unknown>,
  resolvedSpecs: Array<{ spec: Record<string, unknown>; route: ProxyRoute<unknown> }>,
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

/** Merge a single path item from an external spec into the paths map, filtering by allowed methods. */
function mergePathItem(
  externalPath: string,
  pathItem: Record<string, unknown>,
  routeMethods: string[],
  metadata: ProxyRoute<unknown>['openapi'],
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

/** Build the inline OpenAPI spec by fetching from a temporary Hono app using hono-openapi. */
async function buildInlineSpec(
  app: Hono,
  options: OpenApiOptions | undefined,
): Promise<Record<string, unknown>> {
  const tempApp = new Hono();
  const inlineHandler = openAPIRouteHandler as (
    app: Hono,
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
  (tempApp.get as (path: string, ...handlers: Array<unknown>) => Hono)(
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

/** Build the final OpenAPI spec with title, version, description, and servers, preferring options over inline defaults. */
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

    app.get(`${swaggerPath}/openapi.json`, async (c) => {
      if (cachedSpec) {
        return c.json(cachedSpec);
      }

      let specResolution: Promise<void> | null = null;

      const resolveSpec = async (): Promise<void> => {
        try {
          const inlineSpec = await buildInlineSpec(app, options);
          const resolved = await resolveOpenApiSpec(proxyRoutes as ProxyRoute<unknown>[]);
          const mergedSpec = mergeExternalSpecs(inlineSpec, resolved);
          cachedSpec = buildFinalSpec(mergedSpec, options);
        } catch {
          cachedSpec = {};
        }
      };

      specResolution = resolveSpec();
      await specResolution;
      return c.json(cachedSpec ?? {});
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
