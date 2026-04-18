import type { OpenAPIV3 } from 'openapi-types';
import { z } from 'zod';
import type { ServerConfig } from '../config/types';
import { apiRoute, proxyRoute } from '../config/types';
import { generateOpenApiSpec } from './generator';

function asResponseObject(val: unknown): OpenAPIV3.ResponseObject {
  return val as OpenAPIV3.ResponseObject;
}

function asRequestBodyObject(val: unknown): OpenAPIV3.RequestBodyObject {
  return val as OpenAPIV3.RequestBodyObject;
}

const minimalConfig: ServerConfig = {
  spa: { root: '/var/www' },
};

describe('generateOpenApiSpec', () => {
  it('generates valid OpenAPI 3.0.3 document structure', () => {
    const spec = generateOpenApiSpec(minimalConfig);

    expect(spec.openapi).toBe('3.0.3');
    expect(spec.info.title).toBe('bSPA API');
    expect(spec.info.version).toBe('1.0.0');
    expect(spec.paths).toEqual({});
  });

  it('uses custom title and version from options', () => {
    const spec = generateOpenApiSpec(minimalConfig, {
      title: 'My API',
      version: '2.0.0',
      description: 'A custom API',
    });

    expect(spec.info.title).toBe('My API');
    expect(spec.info.version).toBe('2.0.0');
    expect(spec.info.description).toBe('A custom API');
  });

  it('includes servers from options', () => {
    const spec = generateOpenApiSpec(minimalConfig, {
      servers: [{ url: 'https://api.example.com', description: 'Production' }],
    });

    expect(spec.servers).toEqual([{ url: 'https://api.example.com', description: 'Production' }]);
  });

  it('includes paths from apiRoutes with correct methods', () => {
    const config: ServerConfig = {
      spa: { root: '/var/www' },
      apiRoutes: [
        apiRoute({ access: 'public', method: 'get', path: '/users', handler: async () => ({}) }),
        apiRoute({ access: 'public', method: 'post', path: '/users', handler: async () => ({}) }),
      ],
    };

    const spec = generateOpenApiSpec(config);
    const usersPath = spec.paths['/users'];

    expect(usersPath).toBeDefined();
    expect(usersPath).toHaveProperty('get');
    expect(usersPath).toHaveProperty('post');
  });

  it('defaults method to get when not specified', () => {
    const config: ServerConfig = {
      spa: { root: '/var/www' },
      apiRoutes: [apiRoute({ access: 'public', path: '/health', handler: async () => ({}) })],
    };

    const spec = generateOpenApiSpec(config);
    expect(spec.paths['/health']).toHaveProperty('get');
  });

  it('converts Zod validationSchema to requestBody schema', () => {
    const UserSchema = z.object({ name: z.string(), email: z.string().email() });
    const config: ServerConfig = {
      spa: { root: '/var/www' },
      apiRoutes: [
        apiRoute({
          access: 'public',
          method: 'post',
          path: '/users',
          validationSchema: UserSchema,
          handler: async () => ({}),
        }),
      ],
    };

    const spec = generateOpenApiSpec(config);
    const op = spec.paths['/users']?.post;

    expect(op?.requestBody).toBeDefined();
    const body = asRequestBodyObject(op?.requestBody);
    expect(body?.required).toBe(true);
    expect(body?.content?.['application/json']?.schema).toEqual({
      $ref: '#/components/schemas/RequestBody',
    });
    expect(spec.components?.schemas).toHaveProperty('RequestBody');
  });

  it('adds security requirements for private routes', () => {
    const config: ServerConfig = {
      spa: { root: '/var/www' },
      security: { auth: { strategy: 'bearer', secret: () => 'secret' } },
      apiRoutes: [
        apiRoute({ access: 'private', method: 'get', path: '/profile', handler: async () => ({}) }),
      ],
    };

    const spec = generateOpenApiSpec(config);
    const op = spec.paths['/profile']?.get;

    expect(op?.security).toEqual([{ BearerAuth: [] }]);
  });

  it('adds BearerAuth security scheme when auth is configured', () => {
    const config: ServerConfig = {
      spa: { root: '/var/www' },
      security: { auth: { strategy: 'bearer', secret: () => 'secret' } },
      apiRoutes: [
        apiRoute({ access: 'private', method: 'get', path: '/profile', handler: async () => ({}) }),
      ],
    };

    const spec = generateOpenApiSpec(config);

    expect(spec.components?.securitySchemes?.BearerAuth).toEqual({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
    });
  });

  it('excludes security for public routes', () => {
    const config: ServerConfig = {
      spa: { root: '/var/www' },
      security: { auth: { strategy: 'bearer', secret: () => 'secret' } },
      apiRoutes: [
        apiRoute({ access: 'public', method: 'get', path: '/health', handler: async () => ({}) }),
      ],
    };

    const spec = generateOpenApiSpec(config);
    const op = spec.paths['/health']?.get;

    expect(op?.security).toBeUndefined();
  });

  it('includes proxy routes when includeProxyRoutes is true (default)', () => {
    const config: ServerConfig = {
      spa: { root: '/var/www' },
      proxyRoutes: [
        proxyRoute({
          access: 'public',
          methods: ['get', 'post'],
          path: '/api/users',
          target: 'https://api.example.com',
        }),
      ],
    };

    const spec = generateOpenApiSpec(config);
    const pathItem = spec.paths['/api/users'];

    expect(pathItem).toBeDefined();
    expect(pathItem).toHaveProperty('get');
    expect(pathItem).toHaveProperty('post');
  });

  it('excludes proxy routes when includeProxyRoutes is false', () => {
    const config: ServerConfig = {
      spa: { root: '/var/www' },
      proxyRoutes: [
        proxyRoute({
          access: 'public',
          methods: ['get'],
          path: '/api/users',
          target: 'https://api.example.com',
        }),
      ],
    };

    const spec = generateOpenApiSpec(config, { includeProxyRoutes: false });

    expect(spec.paths['/api/users']).toBeUndefined();
  });

  it('extracts path parameters from route patterns', () => {
    const config: ServerConfig = {
      spa: { root: '/var/www' },
      apiRoutes: [
        apiRoute({
          access: 'public',
          method: 'get',
          path: '/users/:id',
          handler: async () => ({}),
        }),
      ],
    };

    const spec = generateOpenApiSpec(config);
    const op = spec.paths['/users/{id}']?.get;

    expect(spec.paths['/users/{id}']).toBeDefined();
    expect(op?.parameters).toEqual([
      { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
    ]);
  });

  it('extracts multiple path parameters', () => {
    const config: ServerConfig = {
      spa: { root: '/var/www' },
      apiRoutes: [
        apiRoute({
          access: 'public',
          method: 'get',
          path: '/orgs/:orgId/users/:userId',
          handler: async () => ({}),
        }),
      ],
    };

    const spec = generateOpenApiSpec(config);
    const op = spec.paths['/orgs/{orgId}/users/{userId}']?.get;

    expect(op?.parameters).toEqual([
      { name: 'orgId', in: 'path', required: true, schema: { type: 'string' } },
      { name: 'userId', in: 'path', required: true, schema: { type: 'string' } },
    ]);
  });

  it('uses custom summary/tags/description from openapi metadata', () => {
    const config: ServerConfig = {
      spa: { root: '/var/www' },
      apiRoutes: [
        apiRoute({
          access: 'public',
          method: 'get',
          path: '/users',
          handler: async () => ({}),
          openapi: {
            summary: 'List users',
            description: 'Returns all users',
            tags: ['users'],
          },
        }),
      ],
    };

    const spec = generateOpenApiSpec(config);
    const op = spec.paths['/users']?.get;

    expect(op?.summary).toBe('List users');
    expect(op?.description).toBe('Returns all users');
    expect(op?.tags).toEqual(['users']);
  });

  it('registers response schemas in components', () => {
    const UserResponseSchema = z.object({
      id: z.string(),
      name: z.string(),
    });
    const config: ServerConfig = {
      spa: { root: '/var/www' },
      apiRoutes: [
        apiRoute({
          access: 'public',
          method: 'get',
          path: '/users',
          handler: async () => ({}),
          openapi: {
            responseSchema: UserResponseSchema,
          },
        }),
      ],
    };

    const spec = generateOpenApiSpec(config);
    const op = spec.paths['/users']?.get;

    expect(asResponseObject(op?.responses['200'])?.content?.['application/json']?.schema).toEqual({
      $ref: '#/components/schemas/Response',
    });
    expect(spec.components?.schemas).toHaveProperty('Response');
  });

  it('uses custom responses from openapi metadata', () => {
    const ErrorSchema = z.object({ error: z.string() });
    const config: ServerConfig = {
      spa: { root: '/var/www' },
      apiRoutes: [
        apiRoute({
          access: 'public',
          method: 'get',
          path: '/users',
          handler: async () => ({}),
          openapi: {
            responses: {
              200: { description: 'Success' },
              404: { description: 'Not found', schema: ErrorSchema },
            },
          },
        }),
      ],
    };

    const spec = generateOpenApiSpec(config);
    const op = spec.paths['/users']?.get;

    expect(asResponseObject(op?.responses['200'])?.description).toBe('Success');
    expect(asResponseObject(op?.responses['404'])?.description).toBe('Not found');
    expect(asResponseObject(op?.responses['404'])?.content?.['application/json']?.schema).toEqual({
      $ref: '#/components/schemas/Response',
    });
  });

  it('handles empty routes array gracefully', () => {
    const config: ServerConfig = {
      spa: { root: '/var/www' },
      apiRoutes: [],
      proxyRoutes: [],
    };

    const spec = generateOpenApiSpec(config);

    expect(spec.openapi).toBe('3.0.3');
    expect(spec.paths).toEqual({});
  });

  it('generates default 200 response when no openapi metadata', () => {
    const config: ServerConfig = {
      spa: { root: '/var/www' },
      apiRoutes: [
        apiRoute({ access: 'public', method: 'get', path: '/health', handler: async () => ({}) }),
      ],
    };

    const spec = generateOpenApiSpec(config);
    const op = spec.paths['/health']?.get;

    expect(asResponseObject(op?.responses['200'])?.description).toBe('Successful response');
  });

  it('adds JWKS description for jwks auth strategy', () => {
    const config: ServerConfig = {
      spa: { root: '/var/www' },
      security: {
        auth: {
          strategy: 'jwks',
          jwksUri: 'https://auth.example.com/.well-known/jwks.json',
        },
      },
      apiRoutes: [
        apiRoute({ access: 'private', method: 'get', path: '/profile', handler: async () => ({}) }),
      ],
    };

    const spec = generateOpenApiSpec(config);

    expect(spec.components?.securitySchemes?.BearerAuth).toEqual({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
      description: 'JWT authentication via JWKS',
    });
  });

  it('generates proxy route summary from target', () => {
    const config: ServerConfig = {
      spa: { root: '/var/www' },
      proxyRoutes: [
        proxyRoute({
          access: 'public',
          methods: ['get'],
          path: '/api/orders',
          target: 'https://api.example.com',
        }),
      ],
    };

    const spec = generateOpenApiSpec(config);
    const op = spec.paths['/api/orders']?.get;

    expect(op?.summary).toBe('Proxy to https://api.example.com');
  });

  it('deduplicates shared Zod schema across routes via WeakMap', () => {
    const SharedSchema = z.object({ id: z.string(), name: z.string() });
    const config: ServerConfig = {
      spa: { root: '/var/www' },
      apiRoutes: [
        apiRoute({
          access: 'public',
          method: 'get',
          path: '/users',
          handler: async () => ({}),
          openapi: { responseSchema: SharedSchema },
        }),
        apiRoute({
          access: 'public',
          method: 'get',
          path: '/admin/users',
          handler: async () => ({}),
          openapi: { responseSchema: SharedSchema },
        }),
      ],
    };

    const spec = generateOpenApiSpec(config);
    const schemaKeys = Object.keys(spec.components?.schemas ?? {});

    expect(schemaKeys.length).toBe(1);
    expect(spec.components?.schemas).toHaveProperty('Response');
  });

  it('deduplicates shared validationSchema across routes', () => {
    const SharedBody = z.object({ name: z.string() });
    const config: ServerConfig = {
      spa: { root: '/var/www' },
      apiRoutes: [
        apiRoute({
          access: 'public',
          method: 'post',
          path: '/users',
          validationSchema: SharedBody,
          handler: async () => ({}),
        }),
        apiRoute({
          access: 'public',
          method: 'post',
          path: '/admin/users',
          validationSchema: SharedBody,
          handler: async () => ({}),
        }),
      ],
    };

    const spec = generateOpenApiSpec(config);
    const schemaKeys = Object.keys(spec.components?.schemas ?? {});

    expect(schemaKeys.length).toBe(1);
  });

  it('uses schemaName from openapi metadata for response schema', () => {
    const UserSchema = z.object({ id: z.string(), name: z.string() });
    const config: ServerConfig = {
      spa: { root: '/var/www' },
      apiRoutes: [
        apiRoute({
          access: 'public',
          method: 'get',
          path: '/users',
          handler: async () => ({}),
          openapi: {
            schemaName: 'User',
            responseSchema: UserSchema,
          },
        }),
      ],
    };

    const spec = generateOpenApiSpec(config);
    const op = spec.paths['/users']?.get;

    expect(asResponseObject(op?.responses['200'])?.content?.['application/json']?.schema).toEqual({
      $ref: '#/components/schemas/User',
    });
    expect(spec.components?.schemas).toHaveProperty('User');
  });

  it('uses requestSchemaName from openapi metadata for validationSchema', () => {
    const CreateUserSchema = z.object({ name: z.string(), email: z.string() });
    const config: ServerConfig = {
      spa: { root: '/var/www' },
      apiRoutes: [
        apiRoute({
          access: 'public',
          method: 'post',
          path: '/users',
          validationSchema: CreateUserSchema,
          handler: async () => ({}),
          openapi: { requestSchemaName: 'CreateUser' },
        }),
      ],
    };

    const spec = generateOpenApiSpec(config);
    const op = spec.paths['/users']?.post;

    expect(asRequestBodyObject(op?.requestBody)?.content?.['application/json']?.schema).toEqual({
      $ref: '#/components/schemas/CreateUser',
    });
    expect(spec.components?.schemas).toHaveProperty('CreateUser');
  });

  it('auto-generates incremental schema names for distinct schemas', () => {
    const UserSchema = z.object({ id: z.string() });
    const AdminSchema = z.object({ role: z.string() });
    const config: ServerConfig = {
      spa: { root: '/var/www' },
      apiRoutes: [
        apiRoute({
          access: 'public',
          method: 'get',
          path: '/users',
          handler: async () => ({}),
          openapi: { responseSchema: UserSchema },
        }),
        apiRoute({
          access: 'public',
          method: 'get',
          path: '/admins',
          handler: async () => ({}),
          openapi: { responseSchema: AdminSchema },
        }),
      ],
    };

    const spec = generateOpenApiSpec(config);

    expect(spec.components?.schemas).toHaveProperty('Response');
    expect(spec.components?.schemas).toHaveProperty('Response2');
  });

  it('deduplicates shared non-object schema (e.g. z.array) across routes', () => {
    const SharedArraySchema = z.array(z.object({ id: z.string() }));
    const config: ServerConfig = {
      spa: { root: '/var/www' },
      apiRoutes: [
        apiRoute({
          access: 'public',
          method: 'get',
          path: '/users',
          handler: async () => ({}),
          openapi: { responseSchema: SharedArraySchema },
        }),
        apiRoute({
          access: 'public',
          method: 'get',
          path: '/admin/users',
          handler: async () => ({}),
          openapi: { responseSchema: SharedArraySchema },
        }),
      ],
    };

    const spec = generateOpenApiSpec(config);
    const schemaKeys = Object.keys(spec.components?.schemas ?? {});

    expect(schemaKeys.length).toBe(1);
    expect(spec.components?.schemas).toHaveProperty('Response');
  });

  it('registers non-object schemas as component refs instead of inlining', () => {
    const TagsSchema = z.enum(['admin', 'user']);
    const config: ServerConfig = {
      spa: { root: '/var/www' },
      apiRoutes: [
        apiRoute({
          access: 'public',
          method: 'get',
          path: '/tags',
          handler: async () => ({}),
          openapi: { responseSchema: TagsSchema },
        }),
      ],
    };

    const spec = generateOpenApiSpec(config);
    const op = spec.paths['/tags']?.get;

    expect(asResponseObject(op?.responses['200'])?.content?.['application/json']?.schema).toEqual({
      $ref: '#/components/schemas/Response',
    });
    expect(spec.components?.schemas).toHaveProperty('Response');
  });

  it('does not include $defs or definitions in generated schemas', () => {
    const ItemSchema = z.object({ id: z.string() });
    const ListSchema = z.array(ItemSchema);
    const config: ServerConfig = {
      spa: { root: '/var/www' },
      apiRoutes: [
        apiRoute({
          access: 'public',
          method: 'get',
          path: '/items',
          handler: async () => ({}),
          openapi: { responseSchema: ListSchema },
        }),
      ],
    };

    const spec = generateOpenApiSpec(config);

    for (const schema of Object.values(spec.components?.schemas ?? {})) {
      expect(schema).not.toHaveProperty('$defs');
      expect(schema).not.toHaveProperty('definitions');
    }
  });

  it('uses schemaName and requestSchemaName independently without collision', () => {
    const UserResponse = z.object({ id: z.string(), name: z.string() });
    const CreateUserBody = z.object({ name: z.string(), email: z.string() });
    const config: ServerConfig = {
      spa: { root: '/var/www' },
      apiRoutes: [
        apiRoute({
          access: 'public',
          method: 'post',
          path: '/users',
          validationSchema: CreateUserBody,
          handler: async () => ({}),
          openapi: {
            schemaName: 'User',
            requestSchemaName: 'CreateUser',
            responseSchema: UserResponse,
          },
        }),
      ],
    };

    const spec = generateOpenApiSpec(config);
    const op = spec.paths['/users']?.post;

    expect(asResponseObject(op?.responses['200'])?.content?.['application/json']?.schema).toEqual({
      $ref: '#/components/schemas/User',
    });
    expect(asRequestBodyObject(op?.requestBody)?.content?.['application/json']?.schema).toEqual({
      $ref: '#/components/schemas/CreateUser',
    });
    expect(spec.components?.schemas).toHaveProperty('User');
    expect(spec.components?.schemas).toHaveProperty('CreateUser');
  });
});
