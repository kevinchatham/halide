# API routes & validation

API routes are handler functions that compose and return data directly. They define the controlled API surface your frontend can call.

```ts
apiRoutes: [
  {
    type: 'api',
    path: '/bff/config',
    access: 'public',
    method: 'get',
    handler: async (ctx, claims, logger) => ({
      environment: process.env.NODE_ENV,
    }),
  },
  {
    type: 'api',
    path: '/users',
    access: 'private',
    method: 'post',
    validationSchema: CreateUserSchema, // Zod schema: body is validated before handler runs
    handler: async (ctx, claims, logger) => {
      return { id: crypto.randomUUID(), ...ctx.body };
    },
  },
];
```

The handler receives three arguments:

| Parameter | Type                               | Description                                              |
| --------- | ---------------------------------- | -------------------------------------------------------- |
| `ctx`     | `RequestContext & { body: TBody }` | Method, path, headers, params, query, and validated body |
| `claims`  | `TClaims \| undefined`             | Decoded JWT claims (undefined for public routes)         |
| `logger`  | `Logger`                           | Structured logger instance                               |

Use the `apiRoute()` factory to fill in the `type` field and default `authorize` function:

```ts
import { apiRoute } from 'halide';

const healthRoute = apiRoute({
  access: 'public',
  path: '/health',
  handler: async () => ({ status: 'ok' }),
});
```

## Validation

Attach a Zod schema to an API route with `validationSchema`. The body is parsed and validated before the handler runs. If validation fails, the server responds with `400 Bad Request` and the validation errors.

```ts
apiRoute({
  access: 'private',
  path: '/users',
  method: 'post',
  validationSchema: z.object({ email: z.string().email(), name: z.string().min(1) }),
  handler: async (ctx) => createUser(ctx.body),
}),
```
