# API routes & validation

API routes are handler functions that compose and return data directly. They define the controlled API surface your frontend can call.

Use the `apiRoute()` factory to create routes — it fills in the `type` field and provides a default `authorize` function:

```ts
import { apiRoute } from 'halide';

apiRoute({
  access: 'public',
  path: '/bff/config',
  method: 'get',
  handler: async (ctx, claims, logger) => ({
    environment: process.env.NODE_ENV,
  }),
});
```

With body validation:

```ts
import { apiRoute } from 'halide';
import { z } from 'zod';

apiRoute({
  access: 'private',
  path: '/users',
  method: 'post',
  requestSchema: z.object({ email: z.string().email(), name: z.string().min(1) }),
  handler: async (ctx, claims, logger) => {
    return { id: crypto.randomUUID(), ...ctx.body };
  },
});
```

## Handler signature

The handler receives three arguments:

| Parameter | Type                               | Description                                              |
| --------- | ---------------------------------- | -------------------------------------------------------- |
| `ctx`     | `RequestContext & { body: TBody }` | Method, path, headers, params, query, and validated body |
| `claims`  | `TClaims \| undefined`             | Decoded JWT claims (undefined for public routes)         |
| `logger`  | `Logger`                           | Structured logger instance                               |

`ctx` is a **plain object** (not a Hono Context). It is constructed from the Hono request with normalized method, path, headers, params, query, and body.

Handler return values are JSON-serialized via `c.json(result)`.

## Supported methods

`'get'` (default), `'post'`, `'put'`, `'patch'`, `'delete'`.

## Body handling

For routes **with** `requestSchema`, the body is parsed and validated before the handler runs. If validation fails, the server responds with `400 Bad Request` and the validation errors.

For routes **without** `requestSchema`, the body is parsed from JSON automatically for `POST`, `PUT`, and `PATCH` requests. For `GET` and `DELETE`, body is `undefined`.
