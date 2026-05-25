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

When enabled, a warning is logged at startup: Scalar routes use relaxed CSP directives, and custom CSP settings do not apply to these routes. This should be disabled in production.

## Per-route metadata

Attach metadata to individual routes for richer documentation:

```ts
import { defineHalide } from 'halide';

const { apiRoute } = defineHalide();

apiRoute({
  access: 'public',
  path: '/users',
  method: 'post',
  requestSchema: CreateUserSchema,
  responseSchema: UserResponseSchema,
  openapi: {
    summary: 'Create a user',
    description: 'Creates a new user with the given name and email.',
    tags: ['Users'],
  },
  handler: async (ctx, app) => createUser(ctx.body),
});
```

Zod schemas from `requestSchema` are automatically used for the OpenAPI request body. `responseSchema` (a route-level field) defines the 200 response body. All Zod schemas are automatically converted to JSON Schema in the generated spec.

### Per-route `openapi` fields

| Field         | Type                                                          | Description                                 |
| ------------- | ------------------------------------------------------------- | ------------------------------------------- |
| `summary`     | `string`                                                      | Short summary of what the route does        |
| `description` | `string`                                                      | Detailed description of the route           |
| `tags`        | `string[]`                                                    | Tags for grouping routes in the UI          |
| `responses`   | `Record<number, { description: string; schema?: ZodSchema }>` | Map of status codes to response definitions |

## Alternative: `openapi.responses`

Instead of `responseSchema`, you can use `openapi.responses` to define multiple response codes:

```ts
import { defineHalide } from 'halide';

const { apiRoute } = defineHalide();

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
  handler: async (ctx, app) => getUser(ctx.params.id),
});
```

When `responses` is present, `responseSchema` is ignored. When neither is present, a default `200` response with `'Successful response'` description is generated.

## Skipping observability hooks

Set `observe: false` on a route to skip `onRequest` and `onResponse` hooks for that route. The route will still appear in the OpenAPI documentation.

## External specs via `openapiSpec`

Proxy routes can reference an external OpenAPI specification using the `openapiSpec` field. This is useful when you're proxying to a backend service that already has its own API documentation.

```ts
const { proxyRoute } = defineHalide();

const ordersProxy = proxyRoute({
  access: 'public',
  path: '/api/orders',
  methods: ['get', 'post'],
  target: 'http://orders.internal:8080',
  proxyPath: '/orders',
  openapiSpec: {
    path: './openapi/orders-api.json', // local file path
  },
});
```

The `path` can be a local file path (relative to the current working directory) or a URL. When a URL is provided, the spec is fetched at startup and cached. Fetch requests use a 10-second timeout.

The external spec is merged into the inline OpenAPI documentation. Only paths and operations matching the proxy route's `methods` are included. If the external spec defines operations for methods not in the route's `methods` array, those operations are filtered out.

Spec fetching uses a concurrency guard — concurrent requests for the same spec URL are deduplicated. The resolved spec is cached and reused across OpenAPI UI requests.

## Scalar UI

The documentation UI uses [Scalar](https://github.com/scalar/scalar) (`@scalar/hono-api-reference`), not Swagger UI. The Scalar agent, MCP server, client button, and developer tools are all disabled. `showDeveloperTools` is set to `'never'`, meaning developer tools are completely hidden from the UI.
