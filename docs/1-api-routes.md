# API routes & validation

API routes are handler functions that compose and return data directly. They define the controlled API surface your frontend can call.

Use the `apiRoute()` factory to create routes — it fills in the `type` field and provides a default `authorize` function:

```ts
import { apiRoute } from 'halide';

apiRoute({
  access: 'public',
  path: '/bff/config',
  method: 'get',
  handler: async (ctx, app) => ({
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
  handler: async (ctx, app) => {
    return { id: crypto.randomUUID(), ...ctx.body };
  },
});
```

## Handler signature

The handler receives two arguments:

| Parameter | Type                               | Description                                              |
| --------- | ---------------------------------- | -------------------------------------------------------- |
| `ctx`     | `RequestContext & { body: TBody }` | Method, path, headers, params, query, and validated body |
| `app`     | `TApp`                             | Bundled app context with `claims` and `logger`           |

`app` is a `HalideContext<TClaims, TLogScope>` object containing:

- `claims` — decoded JWT claims (undefined for public routes)
- `logger` — structured logger instance

`ctx` is a **plain object** (not a Hono Context). It is constructed from the Hono request with normalized method, path, headers, params, query, and body.

Handler return values are JSON-serialized. Returning a native `Response` bypasses serialization and returns it directly.

## Supported methods

`'get'` (default), `'post'`, `'put'`, `'patch'`, `'delete'`.

## Body handling

For routes **with** `requestSchema`, the body is parsed and validated before the handler runs. If validation fails, the server responds with `400 Bad Request` and the validation errors.

For routes **without** `requestSchema`, the body is parsed from JSON automatically for `POST`, `PUT`, and `PATCH` requests. For `GET` and `DELETE`, body is `undefined`.
