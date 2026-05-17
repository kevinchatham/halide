# Testing utilities

Halide exports testing utilities from `halide/test-utils` for writing unit tests against your routes and middleware.

## `createTestApp(config, options)`

Creates a Hono application configured with routes and OpenAPI routes for testing. Registers all routes from config and adds OpenAPI documentation routes. Uses a noop logger by default so tests don't produce log output.

```ts
import { createTestApp } from 'halide/test-utils';
import { apiRoute } from './halide/builder';

const app = createTestApp({
  apiRoutes: [
    apiRoute({
      access: 'public',
      path: '/health',
      handler: async () => ({ status: 'ok' }),
    }),
  ],
});
```

Returns a Hono app with routes registered but not started. You can use `app.request()` to test routes:

```ts
const res = await app.request('/health');
expect(res.status).toBe(200);
expect(await res.json()).toEqual({ status: 'ok' });
```

## `TestAppOptions`

Optional second argument to `createTestApp` that controls which middleware pipelines are applied. All flags default to `false` for isolated testing — only the routes and OpenAPI routes are registered by default.

| Flag           | Default      | Description                                   |
| -------------- | ------------ | --------------------------------------------- |
| `cors`         | `false`      | Apply CORS + CSRF middleware                  |
| `csp`          | `false`      | Apply CSP security headers middleware         |
| `rateLimit`    | `false`      | Apply rate limiting middleware                |
| `requestId`    | `false`      | Apply request ID middleware                   |
| `errorHandler` | `false`      | Apply global error handler middleware         |
| `appHandler`   | `false`      | Apply SPA fallback + static file handler      |
| `logger`       | `noopLogger` | Logger override — defaults to the noop logger |

```ts
const app = createTestApp(config, {
  cors: true,
  errorHandler: true,
});
```

## `noopLogger`

Pre-created noop logger instance that discards all log messages. Re-exported for convenience so tests don't need to import from `config/defaults`.

```ts
import { noopLogger } from 'halide/test-utils';
```

## `disposeRateLimit(app)`

Cleanup function for rate limit resources. When `createTestApp` is called with `{ rateLimit: true }`, the rate limit middleware's dispose function is stored internally. Call `disposeRateLimit(app)` after tests complete to clean up resources (clears the cleanup timer).

```ts
import { createTestApp, disposeRateLimit } from 'halide/test-utils';

const app = createTestApp(config, { rateLimit: true });

// ... run tests ...

disposeRateLimit(app); // returns true if cleanup was performed
```

Returns `true` if a dispose function was found and invoked, `false` otherwise.

## Example test

```ts
import { createTestApp, noopLogger } from 'halide/test-utils';
import { apiRoute } from './halide/builder';
import { z } from 'zod';

describe('User routes', () => {
  it('creates a user with valid input', async () => {
    const CreateUserSchema = z.object({
      email: z.string().email(),
      name: z.string().min(1),
    });

    const app = createTestApp({
      apiRoutes: [
        apiRoute({
          access: 'public',
          path: '/users',
          method: 'post',
          requestSchema: CreateUserSchema,
          handler: async (ctx) => ({
            id: crypto.randomUUID(),
            ...ctx.body,
          }),
        }),
      ],
    });

    const res = await app.request('/users', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'test@example.com', name: 'Test' }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      email: 'test@example.com',
      name: 'Test',
    });
    expect(json.id).toBeDefined();
  });

  it('returns 400 for invalid input', async () => {
    const CreateUserSchema = z.object({
      email: z.string().email(),
      name: z.string().min(1),
    });

    const app = createTestApp({
      apiRoutes: [
        apiRoute({
          access: 'public',
          path: '/users',
          method: 'post',
          requestSchema: CreateUserSchema,
          handler: async (ctx) => ({ id: '1', ...ctx.body }),
        }),
      ],
    });

    const res = await app.request('/users', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'not-an-email', name: '' }),
    });

    expect(res.status).toBe(400);
  });
});
```

## Tips

- **Isolate tests**: Each test should create its own app instance to avoid shared state.
- **Enable middleware selectively**: Use `TestAppOptions` flags to test specific middleware behavior without configuring the full stack.
- **Clean up rate limits**: Always call `disposeRateLimit(app)` after tests that enable rate limiting, to prevent timer leaks.
- **Use `noopLogger`**: Pass `logger: noopLogger` in TestAppOptions to suppress log output during tests.
