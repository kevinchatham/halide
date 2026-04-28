# OpenAPI / Scalar UI

Auto-generate API documentation from your route definitions using Scalar UI.

```ts
openapi: {
  enabled: true,
  path: '/swagger',            // where Scalar UI is served (default: /swagger)
  options: {
    title: 'My App API',
    description: 'Auto-generated API documentation',
    version: '1.0.0',
    servers: [{ url: 'https://api.example.com', description: 'Production' }],
  },
}
```

When enabled, a warning is logged at startup: Swagger routes use relaxed CSP directives, and custom CSP settings do not apply to these routes. This should be disabled in production.

## Per-route metadata

Attach metadata to individual routes for richer documentation:

```ts
import { apiRoute } from 'halide';

apiRoute({
  access: 'public',
  path: '/users',
  method: 'post',
  requestSchema: CreateUserSchema,
  openapi: {
    summary: 'Create a user',
    description: 'Creates a new user with the given name and email.',
    tags: ['Users'],
    responseSchema: UserResponseSchema,
  },
  handler: async (ctx) => createUser(ctx.body),
});
```

Zod schemas from `requestSchema` are automatically used for the OpenAPI request body. `openapi.responseSchema` defines the 200 response body. All Zod schemas are automatically converted to JSON Schema in the generated spec.

### Per-route `openapi` fields

| Field            | Type                                                          | Description                                         |
| ---------------- | ------------------------------------------------------------- | --------------------------------------------------- |
| `summary`        | `string`                                                      | Short summary of what the route does                |
| `description`    | `string`                                                      | Detailed description of the route                   |
| `tags`           | `string[]`                                                    | Tags for grouping routes in the UI                  |
| `responseSchema` | `ZodSchema`                                                   | Zod schema for the 200 response body                |
| `responses`      | `Record<number, { description: string; schema?: ZodSchema }>` | Map of status codes to response definitions         |

## Alternative: `openapi.responses`

Instead of `responseSchema`, you can use `openapi.responses` to define multiple response codes:

```ts
import { apiRoute } from 'halide';

apiRoute({
  access: 'public',
  path: '/users/:id',
  method: 'get',
  openapi: {
    summary: 'Get a user',
    responses: {
      200: { description: 'User found', schema: UserSchema },
      404: { description: 'User not found' },
    },
  },
  handler: async (ctx) => getUser(ctx.params.id),
});
```

When `responses` is present, `responseSchema` is ignored. When neither is present, a default `200` response with `'Successful response'` description is generated.

## Hiding routes

Set `observe: false` on a route to hide it from the OpenAPI documentation.

## Scalar UI

The documentation UI uses [Scalar](https://github.com/scalar/scalar) (`@scalar/hono-api-reference`), not Swagger UI. The Scalar agent, MCP server, client button, and developer tools are all disabled.
