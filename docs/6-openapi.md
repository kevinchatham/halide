# OpenAPI / Swagger UI

Auto-generate API documentation from your route definitions.

```ts
openapi: {
  enabled: true,
  path: '/swagger',            // where Swagger UI is served (default: /swagger)
  options: {
    title: 'My App API',
    description: 'Auto-generated API documentation',
    version: '1.0.0',
    servers: [{ url: 'https://api.example.com', description: 'Production' }],
    includeProxyRoutes: true,  // include proxy routes in the spec (default: true)
  },
}
```

Attach metadata to individual routes for richer documentation:

```ts
{
  type: 'api',
  path: '/users',
  access: 'public',
  method: 'post',
  validationSchema: CreateUserSchema,
  openapi: {
    summary: 'Create a user',
    description: 'Creates a new user with the given name and email.',
    tags: ['Users'],
    responseSchema: UserResponseSchema,
    requestSchemaName: 'CreateUserRequest',
    schemaName: 'UserResponse',
  },
  handler: async (ctx) => createUser(ctx.body),
}
```

Zod schemas (both `validationSchema` and `openapi.responseSchema`) are automatically converted to JSON Schema in the generated spec.
