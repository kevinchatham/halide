import { promises as fs } from 'node:fs';
import { resolve } from 'node:path';
import type { DescribeRouteOptions, ResponsesWithResolver } from 'hono-openapi';
import { resolver } from 'hono-openapi';
import type { ApiRoute, ProxyRoute } from '../types/api';
import type { OpenApiSource, ResolvedOpenApiSpec } from '../types/openapi';

/**
 * Check whether a Zod schema is wrapped in ZodOptional or ZodNullable.
 *
 * Inspects the internal `typeName` property — stable across Zod 3.x releases.
 * This is the only public way to detect optional wrappers without using
 * `schema.unwrap()` which only works for ZodOptional.
 */
function isOptionalSchema(schema: unknown): boolean {
  const s = schema as { _def?: { typeName?: string } };
  return s._def?.typeName === 'ZodOptional' || s._def?.typeName === 'ZodNullable';
}

/** Resolve an external OpenAPI spec by fetching from URL or reading a local JSON file. */
async function resolveOpenApiSource(source: OpenApiSource): Promise<Record<string, unknown>> {
  let isUrl = false;
  let path = source.path;

  try {
    const parsed = new URL(source.path);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      isUrl = true;
    } else if (parsed.protocol === 'file:') {
      path = parsed.pathname;
    }
  } catch {
    // not a valid URL, treat as file path
  }

  if (isUrl) {
    const response = await fetch(path);
    if (!response.ok) {
      throw new Error(`Failed to fetch OpenAPI spec from ${path}: ${response.statusText}`);
    }
    return response.json() as Promise<Record<string, unknown>>;
  }

  const filePath = resolve(path);
  const fileContents = await fs.readFile(filePath, 'utf-8');

  try {
    return JSON.parse(fileContents) as Record<string, unknown>;
  } catch {
    throw new Error(`Failed to parse OpenAPI spec from ${filePath}: not valid JSON`);
  }
}

/**
 * Resolve external OpenAPI specs from proxy routes.
 *
 * Filters proxy routes that have `openapiSpec` configured and resolves each
 * spec by fetching from URL or reading a local JSON file.
 *
 * @param proxyRoutes - The proxy routes to check for external spec sources.
 * @returns A list of resolved specs paired with their owning routes.
 */
export async function resolveOpenApiSpec(
  proxyRoutes: ProxyRoute<unknown>[],
): Promise<ResolvedOpenApiSpec[]> {
  const results: ResolvedOpenApiSpec[] = [];

  for (const route of proxyRoutes) {
    if (route.openapiSpec) {
      const spec = await resolveOpenApiSource(route.openapiSpec);
      results.push({ route, spec });
    }
  }

  return results;
}

/**
 * Build OpenAPI describeRoute options from route metadata, including hidden flag
 * and request body schema.
 *
 * @typeParam TApp - The bundled app context type combining claims and logger.
 * @param route - The API or proxy route to build options for.
 * @returns Describe route options for hono-openapi.
 */
export function buildDescribeRouteOptions<TApp>(
  route: ApiRoute<TApp> | ProxyRoute<TApp>,
): DescribeRouteOptions {
  const meta = route.openapi;
  const options: DescribeRouteOptions = {};

  if (meta?.summary) options.summary = meta.summary;
  if (meta?.description) options.description = meta.description;
  if (meta?.tags?.length) options.tags = meta.tags;

  if (route.observe === false) options.hide = true;

  options.requestBody = buildRequestBody(route);
  options.responses = buildResponses(route);

  return options;
}

/**
 * Build OpenAPI request body configuration from route request schema, detecting
 * optional wrappers.
 *
 * @typeParam TApp - The bundled app context type combining claims and logger.
 * @param route - The route with a potential request schema.
 * @returns Request body configuration or undefined when no schema exists.
 */
export function buildRequestBody<TApp>(
  route: ApiRoute<TApp> | ProxyRoute<TApp>,
): DescribeRouteOptions['requestBody'] {
  const schema = route.type === 'api' ? route.requestSchema : undefined;
  if (!schema) return undefined;

  const isOptional = isOptionalSchema(schema);

  return {
    content: {
      'application/json': { schema: resolver(schema) as unknown as Record<string, unknown> },
    },
    required: !isOptional,
  };
}

/**
 * Build OpenAPI responses object from route metadata or response schema,
 * defaulting to a 200 successful response.
 *
 * @typeParam TApp - The bundled app context type combining claims and logger.
 * @param route - The route to build response definitions for.
 * @returns Responses map for hono-openapi describeRoute.
 */
export function buildResponses<TApp>(
  route: ApiRoute<TApp> | ProxyRoute<TApp>,
): ResponsesWithResolver {
  const meta = route.openapi;
  const responses: ResponsesWithResolver = {};

  if (meta?.responses) {
    for (const [status, resp] of Object.entries(meta.responses)) {
      const response: Record<string, unknown> = { description: resp.description };
      if (resp.schema) {
        response.content = { 'application/json': { schema: resolver(resp.schema) } };
      }
      responses[status] = response as ResponsesWithResolver[string];
    }
  } else if (route.type === 'api' && route.responseSchema) {
    responses['200'] = {
      content: { 'application/json': { schema: resolver(route.responseSchema) } },
      description: 'Successful response',
    } as ResponsesWithResolver[string];
  } else {
    responses['200'] = { description: 'Successful response' } as ResponsesWithResolver[string];
  }

  return responses;
}
