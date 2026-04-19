import type { OpenAPIV3 } from 'openapi-types';
import { z } from 'zod';
import type { ApiRoute, ServerConfig } from '../config/types';
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
      description: 'A custom API',
      title: 'My API',
      version: '2.0.0',
    });

    expect(spec.info.title).toBe('My API');
    expect(spec.info.version).toBe('2.0.0');
    expect(spec.info.description).toBe('A custom API');
  });

  it('includes servers from options', () => {
    const spec = generateOpenApiSpec(minimalConfig, {
      servers: [{ description: 'Production', url: 'https://api.example.com' }],
    });

    expect(spec.servers).toEqual([{ description: 'Production', url: 'https://api.example.com' }]);
  });

  it('includes paths from apiRoutes with correct methods', () => {
    const config: ServerConfig = {
      apiRoutes: [
        apiRoute({
          access: 'public',
          handler: async () => ({}),
          method: 'get',
          path: '/users',
        }),
        apiRoute({
          access: 'public',
          handler: async () => ({}),
          method: 'post',
          path: '/users',
        }),
      ],
      spa: { root: '/var/www' },
    };

    const spec = generateOpenApiSpec(config);
    const usersPath = spec.paths['/users'];

    expect(usersPath).toBeDefined();
    expect(usersPath).toHaveProperty('get');
    expect(usersPath).toHaveProperty('post');
  });

  it('defaults method to get when not specified', () => {
    const config: ServerConfig = {
      apiRoutes: [
        apiRoute({
          access: 'public',
          handler: async () => ({}),
          path: '/health',
        }),
      ],
      spa: { root: '/var/www' },
    };

    const spec = generateOpenApiSpec(config);
    expect(spec.paths['/health']).toHaveProperty('get');
  });

  it('converts Zod validationSchema to requestBody schema', () => {
    const UserSchema = z.object({
      email: z.string().email(),
      name: z.string(),
    });
    const config: ServerConfig = {
      apiRoutes: [
        apiRoute({
          access: 'public',
          handler: async () => ({}),
          method: 'post',
          path: '/users',
          validationSchema: UserSchema,
        }) as unknown as ApiRoute<unknown>,
      ],
      spa: { root: '/var/www' },
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
      apiRoutes: [
        apiRoute({
          access: 'private',
          handler: async () => ({}),
          method: 'get',
          path: '/profile',
        }),
      ],
      security: { auth: { secret: () => 'secret', strategy: 'bearer' } },
      spa: { root: '/var/www' },
    };

    const spec = generateOpenApiSpec(config);
    const op = spec.paths['/profile']?.get;

    expect(op?.security).toEqual([{ BearerAuth: [] }]);
  });

  it('adds BearerAuth security scheme when auth is configured', () => {
    const config: ServerConfig = {
      apiRoutes: [
        apiRoute({
          access: 'private',
          handler: async () => ({}),
          method: 'get',
          path: '/profile',
        }),
      ],
      security: { auth: { secret: () => 'secret', strategy: 'bearer' } },
      spa: { root: '/var/www' },
    };

    const spec = generateOpenApiSpec(config);

    expect(spec.components?.securitySchemes?.BearerAuth).toEqual({
      bearerFormat: 'JWT',
      scheme: 'bearer',
      type: 'http',
    });
  });

  it('excludes security for public routes', () => {
    const config: ServerConfig = {
      apiRoutes: [
        apiRoute({
          access: 'public',
          handler: async () => ({}),
          method: 'get',
          path: '/health',
        }),
      ],
      security: { auth: { secret: () => 'secret', strategy: 'bearer' } },
      spa: { root: '/var/www' },
    };

    const spec = generateOpenApiSpec(config);
    const op = spec.paths['/health']?.get;

    expect(op?.security).toBeUndefined();
  });

  it('includes proxy routes when includeProxyRoutes is true (default)', () => {
    const config: ServerConfig = {
      proxyRoutes: [
        proxyRoute({
          access: 'public',
          methods: ['get', 'post'],
          path: '/api/users',
          target: 'https://api.example.com',
        }),
      ],
      spa: { root: '/var/www' },
    };

    const spec = generateOpenApiSpec(config);
    const pathItem = spec.paths['/api/users'];

    expect(pathItem).toBeDefined();
    expect(pathItem).toHaveProperty('get');
    expect(pathItem).toHaveProperty('post');
  });

  it('excludes proxy routes when includeProxyRoutes is false', () => {
    const config: ServerConfig = {
      proxyRoutes: [
        proxyRoute({
          access: 'public',
          methods: ['get'],
          path: '/api/users',
          target: 'https://api.example.com',
        }),
      ],
      spa: { root: '/var/www' },
    };

    const spec = generateOpenApiSpec(config, { includeProxyRoutes: false });

    expect(spec.paths['/api/users']).toBeUndefined();
  });

  it('extracts path parameters from route patterns', () => {
    const config: ServerConfig = {
      apiRoutes: [
        apiRoute({
          access: 'public',
          handler: async () => ({}),
          method: 'get',
          path: '/users/:id',
        }),
      ],
      spa: { root: '/var/www' },
    };

    const spec = generateOpenApiSpec(config);
    const op = spec.paths['/users/{id}']?.get;

    expect(spec.paths['/users/{id}']).toBeDefined();
    expect(op?.parameters).toEqual([
      { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
    ]);
  });

  it('extracts multiple path parameters', () => {
    const config: ServerConfig = {
      apiRoutes: [
        apiRoute({
          access: 'public',
          handler: async () => ({}),
          method: 'get',
          path: '/orgs/:orgId/users/:userId',
        }),
      ],
      spa: { root: '/var/www' },
    };

    const spec = generateOpenApiSpec(config);
    const op = spec.paths['/orgs/{orgId}/users/{userId}']?.get;

    expect(op?.parameters).toEqual([
      { in: 'path', name: 'orgId', required: true, schema: { type: 'string' } },
      {
        in: 'path',
        name: 'userId',
        required: true,
        schema: { type: 'string' },
      },
    ]);
  });

  it('uses custom summary/tags/description from openapi metadata', () => {
    const config: ServerConfig = {
      apiRoutes: [
        apiRoute({
          access: 'public',
          handler: async () => ({}),
          method: 'get',
          openapi: {
            description: 'Returns all users',
            summary: 'List users',
            tags: ['users'],
          },
          path: '/users',
        }),
      ],
      spa: { root: '/var/www' },
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
      apiRoutes: [
        apiRoute({
          access: 'public',
          handler: async () => ({}),
          method: 'get',
          openapi: {
            responseSchema: UserResponseSchema,
          },
          path: '/users',
        }),
      ],
      spa: { root: '/var/www' },
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
      apiRoutes: [
        apiRoute({
          access: 'public',
          handler: async () => ({}),
          method: 'get',
          openapi: {
            responses: {
              200: { description: 'Success' },
              404: { description: 'Not found', schema: ErrorSchema },
            },
          },
          path: '/users',
        }),
      ],
      spa: { root: '/var/www' },
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
      apiRoutes: [],
      proxyRoutes: [],
      spa: { root: '/var/www' },
    };

    const spec = generateOpenApiSpec(config);

    expect(spec.openapi).toBe('3.0.3');
    expect(spec.paths).toEqual({});
  });

  it('generates default 200 response when no openapi metadata', () => {
    const config: ServerConfig = {
      apiRoutes: [
        apiRoute({
          access: 'public',
          handler: async () => ({}),
          method: 'get',
          path: '/health',
        }),
      ],
      spa: { root: '/var/www' },
    };

    const spec = generateOpenApiSpec(config);
    const op = spec.paths['/health']?.get;

    expect(asResponseObject(op?.responses['200'])?.description).toBe('Successful response');
  });

  it('adds JWKS description for jwks auth strategy', () => {
    const config: ServerConfig = {
      apiRoutes: [
        apiRoute({
          access: 'private',
          handler: async () => ({}),
          method: 'get',
          path: '/profile',
        }),
      ],
      security: {
        auth: {
          jwksUri: 'https://auth.example.com/.well-known/jwks.json',
          strategy: 'jwks',
        },
      },
      spa: { root: '/var/www' },
    };

    const spec = generateOpenApiSpec(config);

    expect(spec.components?.securitySchemes?.BearerAuth).toEqual({
      bearerFormat: 'JWT',
      description: 'JWT authentication via JWKS',
      scheme: 'bearer',
      type: 'http',
    });
  });

  it('generates proxy route summary from target', () => {
    const config: ServerConfig = {
      proxyRoutes: [
        proxyRoute({
          access: 'public',
          methods: ['get'],
          path: '/api/orders',
          target: 'https://api.example.com',
        }),
      ],
      spa: { root: '/var/www' },
    };

    const spec = generateOpenApiSpec(config);
    const op = spec.paths['/api/orders']?.get;

    expect(op?.summary).toBe('Proxy to https://api.example.com');
  });

  it('deduplicates shared Zod schema across routes via WeakMap', () => {
    const SharedSchema = z.object({ id: z.string(), name: z.string() });
    const config: ServerConfig = {
      apiRoutes: [
        apiRoute({
          access: 'public',
          handler: async () => ({}),
          method: 'get',
          openapi: { responseSchema: SharedSchema },
          path: '/users',
        }),
        apiRoute({
          access: 'public',
          handler: async () => ({}),
          method: 'get',
          openapi: { responseSchema: SharedSchema },
          path: '/admin/users',
        }),
      ],
      spa: { root: '/var/www' },
    };

    const spec = generateOpenApiSpec(config);
    const schemaKeys = Object.keys(spec.components?.schemas ?? {});

    expect(schemaKeys.length).toBe(1);
    expect(spec.components?.schemas).toHaveProperty('Response');
  });

  it('deduplicates shared validationSchema across routes', () => {
    const SharedBody = z.object({ name: z.string() });
    const config: ServerConfig = {
      apiRoutes: [
        apiRoute({
          access: 'public',
          handler: async () => ({}),
          method: 'post',
          path: '/users',
          validationSchema: SharedBody,
        }) as unknown as ApiRoute<unknown>,
        apiRoute({
          access: 'public',
          handler: async () => ({}),
          method: 'post',
          path: '/admin/users',
          validationSchema: SharedBody,
        }) as unknown as ApiRoute<unknown>,
      ],
      spa: { root: '/var/www' },
    };

    const spec = generateOpenApiSpec(config);
    const schemaKeys = Object.keys(spec.components?.schemas ?? {});

    expect(schemaKeys.length).toBe(1);
  });

  it('uses schemaName from openapi metadata for response schema', () => {
    const UserSchema = z.object({ id: z.string(), name: z.string() });
    const config: ServerConfig = {
      apiRoutes: [
        apiRoute({
          access: 'public',
          handler: async () => ({}),
          method: 'get',
          openapi: {
            responseSchema: UserSchema,
            schemaName: 'User',
          },
          path: '/users',
        }),
      ],
      spa: { root: '/var/www' },
    };

    const spec = generateOpenApiSpec(config);
    const op = spec.paths['/users']?.get;

    expect(asResponseObject(op?.responses['200'])?.content?.['application/json']?.schema).toEqual({
      $ref: '#/components/schemas/User',
    });
    expect(spec.components?.schemas).toHaveProperty('User');
  });

  it('uses requestSchemaName from openapi metadata for validationSchema', () => {
    const CreateUserSchema = z.object({ email: z.string(), name: z.string() });
    const config: ServerConfig = {
      apiRoutes: [
        apiRoute({
          access: 'public',
          handler: async () => ({}),
          method: 'post',
          openapi: { requestSchemaName: 'CreateUser' },
          path: '/users',
          validationSchema: CreateUserSchema,
        }) as unknown as ApiRoute<unknown>,
      ],
      spa: { root: '/var/www' },
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
      apiRoutes: [
        apiRoute({
          access: 'public',
          handler: async () => ({}),
          method: 'get',
          openapi: { responseSchema: UserSchema },
          path: '/users',
        }),
        apiRoute({
          access: 'public',
          handler: async () => ({}),
          method: 'get',
          openapi: { responseSchema: AdminSchema },
          path: '/admins',
        }),
      ],
      spa: { root: '/var/www' },
    };

    const spec = generateOpenApiSpec(config);

    expect(spec.components?.schemas).toHaveProperty('Response');
    expect(spec.components?.schemas).toHaveProperty('Response2');
  });

  it('deduplicates shared non-object schema (e.g. z.array) across routes', () => {
    const SharedArraySchema = z.array(z.object({ id: z.string() }));
    const config: ServerConfig = {
      apiRoutes: [
        apiRoute({
          access: 'public',
          handler: async () => ({}),
          method: 'get',
          openapi: { responseSchema: SharedArraySchema },
          path: '/users',
        }),
        apiRoute({
          access: 'public',
          handler: async () => ({}),
          method: 'get',
          openapi: { responseSchema: SharedArraySchema },
          path: '/admin/users',
        }),
      ],
      spa: { root: '/var/www' },
    };

    const spec = generateOpenApiSpec(config);
    const schemaKeys = Object.keys(spec.components?.schemas ?? {});

    expect(schemaKeys.length).toBe(1);
    expect(spec.components?.schemas).toHaveProperty('Response');
  });

  it('registers non-object schemas as component refs instead of inlining', () => {
    const TagsSchema = z.enum(['admin', 'user']);
    const config: ServerConfig = {
      apiRoutes: [
        apiRoute({
          access: 'public',
          handler: async () => ({}),
          method: 'get',
          openapi: { responseSchema: TagsSchema },
          path: '/tags',
        }),
      ],
      spa: { root: '/var/www' },
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
      apiRoutes: [
        apiRoute({
          access: 'public',
          handler: async () => ({}),
          method: 'get',
          openapi: { responseSchema: ListSchema },
          path: '/items',
        }),
      ],
      spa: { root: '/var/www' },
    };

    const spec = generateOpenApiSpec(config);

    for (const schema of Object.values(spec.components?.schemas ?? {})) {
      expect(schema).not.toHaveProperty('$defs');
      expect(schema).not.toHaveProperty('definitions');
    }
  });

  it('uses schemaName and requestSchemaName independently without collision', () => {
    const UserResponse = z.object({ id: z.string(), name: z.string() });
    const CreateUserBody = z.object({ email: z.string(), name: z.string() });
    const config: ServerConfig = {
      apiRoutes: [
        apiRoute({
          access: 'public',
          handler: async () => ({}),
          method: 'post',
          openapi: {
            requestSchemaName: 'CreateUser',
            responseSchema: UserResponse,
            schemaName: 'User',
          },
          path: '/users',
          validationSchema: CreateUserBody,
        }) as unknown as ApiRoute<unknown>,
      ],
      spa: { root: '/var/www' },
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
