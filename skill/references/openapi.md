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
  responses: {
    200: { description: 'Success', schema: UserSchema },
    400: { description: 'Bad Request' },
    401: { description: 'Unauthorized' },
  },
}
```

Zod schemas from `requestSchema` and `responseSchema` are automatically converted to JSON Schema in the generated spec.

## Types

```typescript
type OpenApiConfig = {
  enabled?: boolean; // default: false
  path?: string; // default: '/swagger'
  options?: OpenApiOptions;
};

type OpenApiOptions = {
  title?: string;
  version?: string; // default: '1.0.0'
  description?: string;
  servers?: Array<{ url: string; description?: string }>;
};

type OpenApiRouteMeta = {
  summary?: string;
  description?: string;
  tags?: string[];
  responses?: Record<number, { description: string; schema?: ZodSchema }>;
};

type OpenApiSource = {
  path: string; // local file path or URL
};

type ResolvedOpenApiSpec = {
  spec: Record<string, unknown>;
  route: ProxyRoute<unknown>;
};
```

## Scalar UI

The documentation UI uses [Scalar](https://github.com/scalar/scalar) (`@scalar/hono-api-reference`), not Swagger UI. The Scalar agent, MCP server, client button, and developer tools are all disabled by default.

When OpenAPI is enabled, a warning is logged at startup: Swagger routes use relaxed CSP directives, and custom CSP settings do not apply to these routes. This should be disabled in production.

Set `observe: false` on a route to hide it from OpenAPI docs.
