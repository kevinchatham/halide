import type { OpenAPIV3 } from 'openapi-types';
import { zodToJsonSchema } from 'zod-to-json-schema';
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
  const regex = /:([a-zA-Z_][a-zA-Z0-9_]*)/g;
  let match: RegExpExecArray | null = regex.exec(path);
  while (match !== null) {
    const paramName = match[1];
    if (paramName) {
      params.push({
        name: paramName,
        in: 'path',
        required: true,
        schema: { type: 'string' },
      });
    }
    match = regex.exec(path);
  }
  return params;
}

function toOpenApiPath(path: string): string {
  return path.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, '{$1}');
}

function convertZodSchema(
  schema: import('zod').ZodSchema,
  schemaName: string,
  components: Record<string, OpenAPIV3.SchemaObject>,
  ctx: SchemaContext
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
  ctx: SchemaContext
): OpenAPIV3.ResponsesObject {
  const responses: OpenAPIV3.ResponsesObject = {};

  if (routeOpenapi?.responses) {
    for (const [status, resp] of Object.entries(routeOpenapi.responses)) {
      const response: OpenAPIV3.ResponseObject = { description: resp.description };
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

  const defaultResponse: OpenAPIV3.ResponseObject = { description: 'Successful response' };
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

export function generateOpenApiSpec<TClaims>(
  config: ServerConfig<TClaims>,
  options?: OpenApiOptions
): OpenAPIV3.Document {
  const ctx: SchemaContext = {
    counter: { value: 0 },
    dedup: new WeakMap(),
  };

  const title = options?.title ?? 'bSPA API';
  const version = options?.version ?? '1.0.0';
  const includeProxyRoutes = options?.includeProxyRoutes ?? true;

  const paths: MutablePaths = {};
  const components: Record<string, OpenAPIV3.SchemaObject> = {};
  const hasSecurity = !!config.security?.auth;

  const securitySchemes: Record<string, OpenAPIV3.SecuritySchemeObject> | undefined =
    hasSecurity && config.security?.auth
      ? {
          BearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            ...(config.security.auth.strategy === 'jwks' && {
              description: 'JWT authentication via JWKS',
            }),
          },
        }
      : undefined;

  if (config.apiRoutes) {
    for (const route of config.apiRoutes) {
      const openApiPath = toOpenApiPath(route.path);
      if (!paths[openApiPath]) {
        paths[openApiPath] = {};
      }
      const pathItem = paths[openApiPath] as MutablePathItem;
      const method = (route.method ?? 'get') as keyof MutablePathItem;

      const parameters = extractPathParams(route.path);
      const operation: OpenAPIV3.OperationObject = {
        responses: buildResponses(route.openapi, components, ctx),
      };

      if (parameters.length > 0) {
        operation.parameters = parameters;
      }

      if (route.openapi?.summary) {
        operation.summary = route.openapi.summary;
      }
      if (route.openapi?.description) {
        operation.description = route.openapi.description;
      }
      if (route.openapi?.tags?.length) {
        operation.tags = route.openapi.tags;
      }

      if (route.validationSchema) {
        const schemaName =
          route.openapi?.requestSchemaName ?? generateSchemaName('RequestBody', ctx.counter);
        const schemaRef = convertZodSchema(route.validationSchema, schemaName, components, ctx);
        operation.requestBody = {
          required: true,
          content: {
            'application/json': { schema: schemaRef },
          },
        };
      }

      if (route.access === 'private' && hasSecurity) {
        operation.security = [{ BearerAuth: [] }];
      }

      pathItem[method] = operation;
    }
  }

  if (config.proxyRoutes && includeProxyRoutes) {
    for (const route of config.proxyRoutes) {
      const openApiPath = toOpenApiPath(route.path);
      if (!paths[openApiPath]) {
        paths[openApiPath] = {};
      }
      const pathItem = paths[openApiPath] as MutablePathItem;

      for (const method of route.methods) {
        const methodKey = method as keyof MutablePathItem;
        const parameters = extractPathParams(route.path);
        const operation: OpenAPIV3.OperationObject = {
          summary: route.openapi?.summary ?? `Proxy to ${route.target}`,
          responses: buildResponses(route.openapi, components, ctx),
        };

        if (parameters.length > 0) {
          operation.parameters = parameters;
        }

        if (route.openapi?.description) {
          operation.description = route.openapi.description;
        }
        if (route.openapi?.tags?.length) {
          operation.tags = route.openapi.tags;
        }

        if (route.access === 'private' && hasSecurity) {
          operation.security = [{ BearerAuth: [] }];
        }

        pathItem[methodKey] = operation;
      }
    }
  }

  // MutablePathItem intentionally omits complex intersection constraints of
  // PathItemObject for internal mutation; the output is structurally compatible at runtime.
  const doc: OpenAPIV3.Document = {
    openapi: '3.0.3',
    info: { title, version },
    paths: paths as unknown as OpenAPIV3.PathsObject,
  };

  if (options?.description) {
    doc.info.description = options.description;
  }

  if (options?.servers?.length) {
    doc.servers = options.servers;
  }

  if (securitySchemes) {
    doc.components = { securitySchemes };
  }

  if (Object.keys(components).length > 0) {
    if (!doc.components) {
      doc.components = {};
    }
    doc.components.schemas = components as OpenAPIV3.ComponentsObject['schemas'];
  }

  return doc;
}
