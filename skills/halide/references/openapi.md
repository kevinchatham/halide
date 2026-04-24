# OpenAPI Documentation

## Configuration

Enable OpenAPI documentation with Scalar UI:

```typescript
openapi: {
  enabled: true,
  path: '/swagger',    // default: '/swagger'
  options: {
    title: 'My App API',
    description: 'API documentation',
    version: '1.0.0',
    servers: [{ url: 'https://api.example.com', description: 'Production' }],
  },
}
```

## Per-Route Metadata

Attach to individual routes via `openapi`:

```typescript
openapi: {
  summary: 'Create a user',
  description: 'Creates a new user',
  tags: ['Users'],
  responseSchema: UserResponseSchema,           // Zod schema for 200 response
  requestSchemaName: 'CreateUserRequest',       // name for request schema
  schemaName: 'UserResponse',                   // name for response schema
  responses: {                                  // alternative: map of status codes
    200: { description: 'Success', schema: UserSchema },
    400: { description: 'Bad Request' },
    401: { description: 'Unauthorized' },
  },
}
```

Set `observe: false` on a route to hide it from OpenAPI docs.

Zod schemas from `validationSchema` and `openapi.responseSchema` are automatically converted to JSON Schema in the generated spec.
