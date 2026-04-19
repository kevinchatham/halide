import type { OpenAPIV3 } from 'openapi-types';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { DEFAULTS } from '../config/defaults';
import type { ServerConfig } from '../config/types';
import type { OpenApiOptions } from './types';

type MutablePathItem = {
  get?: OpenAPIV3.OperationObject;
  put?: OpenAPIV3.OperationObject;
  post?: OpenAPIV3.OperationObject;
  delete?: OpenAPIV3.OperationObject;
  options?: OpenAPIV3.OperationObject;
  head?: OpenAPIV3.OperationObject;
  patch?: OpenAPIV3.OperationObject;
  trace?: OpenAPIV3.OperationObject;
};

type MutablePaths = Record<string, MutablePathItem>;

type SchemaContext = {
  counter: { value: number };
  dedup: WeakMap<import('zod').ZodSchema, string>;
};

function generateSchemaName(prefix: string, counter: { value: number }): string {
  counter.value++;
  return `${prefix}${counter.value === 1 ? '' : counter.value}`;
}

function extractPathParams(path: string): OpenAPIV3.ParameterObject[] {
  const params: OpenAPIV3.ParameterObject[] = [];
  const regex = /:(\w+)/g;
  let match: RegExpExecArray | null = regex.exec(path);
  while (match !== null) {
    const paramName = match[1];
    if (paramName) {
      params.push({
        in: 'path',
        name: paramName,
        required: true,
        schema: { type: 'string' },
      });
    }
    match = regex.exec(path);
  }
  return params;
}

function toOpenApiPath(path: string): string {
  return path.replaceAll(/:(\w+)/g, '{$1}');
}

function convertZodSchema(
  schema: import('zod').ZodSchema,
  schemaName: string,
  components: Record<string, OpenAPIV3.SchemaObject>,
  ctx: SchemaContext,
): OpenAPIV3.ReferenceObject | OpenAPIV3.SchemaObject {
  const existing = ctx.dedup.get(schema);
  if (existing) {
    return { $ref: `#/components/schemas/${existing}` };
  }

  const jsonSchema = zodToJsonSchema(schema, { target: 'openApi3' }) as Record<string, unknown>;
  const { $schema, $defs, definitions, ...rest } = jsonSchema as Record<string, unknown> & {
    $schema?: string;
    $defs?: unknown;
    definitions?: unknown;
  };
  const def = rest as OpenAPIV3.SchemaObject;
  ctx.dedup.set(schema, schemaName);
  components[schemaName] = def;
  return { $ref: `#/components/schemas/${schemaName}` };
}

function buildResponses(
  routeOpenapi: import('../config/types').OpenApiRouteMeta | undefined,
  components: Record<string, OpenAPIV3.SchemaObject>,
  ctx: SchemaContext,
): OpenAPIV3.ResponsesObject {
  const responses: OpenAPIV3.ResponsesObject = {};

  if (routeOpenapi?.responses) {
    for (const [status, resp] of Object.entries(routeOpenapi.responses)) {
      const response: OpenAPIV3.ResponseObject = {
        description: resp.description,
      };
      if (resp.schema) {
        const name = generateSchemaName('Response', ctx.counter);
        const schemaRef = convertZodSchema(resp.schema, name, components, ctx);
        response.content = {
          'application/json': { schema: schemaRef },
        };
      }
      responses[status] = response;
    }
    return responses;
  }

  const defaultResponse: OpenAPIV3.ResponseObject = {
    description: 'Successful response',
  };
  if (routeOpenapi?.responseSchema) {
    const name = routeOpenapi.schemaName ?? generateSchemaName('Response', ctx.counter);
    const schemaRef = convertZodSchema(routeOpenapi.responseSchema, name, components, ctx);
    defaultResponse.content = {
      'application/json': { schema: schemaRef },
    };
  }
  responses['200'] = defaultResponse;
  return responses;
}

function buildSecuritySchemes<TClaims>(
  config: ServerConfig<TClaims>,
): Record<string, OpenAPIV3.SecuritySchemeObject> | undefined {
  const auth = config.security?.auth;
  if (!auth) return undefined;

  return {
    BearerAuth: {
      bearerFormat: 'JWT',
      scheme: 'bearer',
      type: 'http',
      ...(auth.strategy === 'jwks' && {
        description: 'JWT authentication via JWKS',
      }),
    },
  };
}

function buildOperationSecurity(
  routeAccess: 'public' | 'private' | undefined,
  hasSecurity: boolean,
): Array<Record<string, string[]>> | undefined {
  return routeAccess === 'private' && hasSecurity ? [{ BearerAuth: [] }] : undefined;
}

function addOperationMetadata(
  operation: OpenAPIV3.OperationObject,
  routeOpenapi: import('../config/types').OpenApiRouteMeta | undefined,
): void {
  if (routeOpenapi?.summary) {
    operation.summary = routeOpenapi.summary;
  }
  if (routeOpenapi?.description) {
    operation.description = routeOpenapi.description;
  }
  if (routeOpenapi?.tags?.length) {
    operation.tags = routeOpenapi.tags;
  }
}

function buildApiRouteOperation<TClaims>(
  route: import('../config/types').ApiRoute<TClaims>,
  components: Record<string, OpenAPIV3.SchemaObject>,
  ctx: SchemaContext,
  hasSecurity: boolean,
): OpenAPIV3.OperationObject {
  const parameters = extractPathParams(route.path);
  const operation: OpenAPIV3.OperationObject = {
    responses: buildResponses(route.openapi, components, ctx),
  };

  if (parameters.length > 0) {
    operation.parameters = parameters;
  }

  addOperationMetadata(operation, route.openapi);

  if (route.validationSchema) {
    const schemaName =
      route.openapi?.requestSchemaName ?? generateSchemaName('RequestBody', ctx.counter);
    const schemaRef = convertZodSchema(route.validationSchema, schemaName, components, ctx);
    operation.requestBody = {
      content: {
        'application/json': { schema: schemaRef },
      },
      required: true,
    };
  }

  const security = buildOperationSecurity(route.access, hasSecurity);
  if (security) {
    operation.security = security;
  }

  return operation;
}

function buildProxyRouteOperation<TClaims>(
  route: import('../config/types').ProxyRoute<TClaims>,
  components: Record<string, OpenAPIV3.SchemaObject>,
  ctx: SchemaContext,
  hasSecurity: boolean,
): OpenAPIV3.OperationObject {
  const parameters = extractPathParams(route.path);
  const operation: OpenAPIV3.OperationObject = {
    responses: buildResponses(route.openapi, components, ctx),
    summary: route.openapi?.summary ?? `Proxy to ${route.target}`,
  };

  if (parameters.length > 0) {
    operation.parameters = parameters;
  }

  addOperationMetadata(operation, route.openapi);

  const security = buildOperationSecurity(route.access, hasSecurity);
  if (security) {
    operation.security = security;
  }

  return operation;
}

function processApiRoutes<TClaims>(
  routes: import('../config/types').ApiRoute<TClaims>[],
  paths: MutablePaths,
  components: Record<string, OpenAPIV3.SchemaObject>,
  ctx: SchemaContext,
  hasSecurity: boolean,
): void {
  for (const route of routes) {
    const openApiPath = toOpenApiPath(route.path);
    paths[openApiPath] ??= {};
    const pathItem = paths[openApiPath];
    const method = (route.method ?? DEFAULTS.route.method) as keyof MutablePathItem;

    pathItem[method] = buildApiRouteOperation(route, components, ctx, hasSecurity);
  }
}

function processProxyRoutes<TClaims>(
  routes: import('../config/types').ProxyRoute<TClaims>[],
  paths: MutablePaths,
  components: Record<string, OpenAPIV3.SchemaObject>,
  ctx: SchemaContext,
  hasSecurity: boolean,
): void {
  for (const route of routes) {
    const openApiPath = toOpenApiPath(route.path);
    paths[openApiPath] ??= {};
    const pathItem = paths[openApiPath];

    for (const method of route.methods) {
      const methodKey = method as keyof MutablePathItem;
      pathItem[methodKey] = buildProxyRouteOperation(route, components, ctx, hasSecurity);
    }
  }
}

function buildOpenApiDocument<TClaims>(
  config: ServerConfig<TClaims>,
  options: OpenApiOptions | undefined,
  paths: MutablePaths,
  components: Record<string, OpenAPIV3.SchemaObject>,
): OpenAPIV3.Document {
  const title = options?.title ?? DEFAULTS.openapi.title;
  const version = options?.version ?? DEFAULTS.openapi.version;

  const doc: OpenAPIV3.Document = {
    info: { title, version },
    openapi: '3.0.3',
    paths: paths as unknown as OpenAPIV3.PathsObject,
  };

  if (options?.description) {
    doc.info.description = options.description;
  }

  if (options?.servers?.length) {
    doc.servers = options.servers;
  }

  const securitySchemes = buildSecuritySchemes(config);
  if (securitySchemes) {
    doc.components = { securitySchemes };
  }

  if (Object.keys(components).length > 0) {
    doc.components ??= {};
    doc.components.schemas = components;
  }

  return doc;
}

export function generateOpenApiSpec<TClaims>(
  config: ServerConfig<TClaims>,
  options?: OpenApiOptions,
): OpenAPIV3.Document {
  const ctx: SchemaContext = {
    counter: { value: 0 },
    dedup: new WeakMap(),
  };

  const includeProxyRoutes = options?.includeProxyRoutes ?? DEFAULTS.openapi.includeProxyRoutes;

  const paths: MutablePaths = {};
  const components: Record<string, OpenAPIV3.SchemaObject> = {};
  const hasSecurity = !!config.security?.auth;

  if (config.apiRoutes) {
    processApiRoutes(config.apiRoutes, paths, components, ctx, hasSecurity);
  }

  if (config.proxyRoutes && includeProxyRoutes) {
    processProxyRoutes(config.proxyRoutes, paths, components, ctx, hasSecurity);
  }

  return buildOpenApiDocument(config, options, paths, components);
}
