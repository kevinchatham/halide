# Project organization

Routes are plain data objects — they carry no runtime dependency on the `defineHalide()` builder that created them. This means you can define routes in separate files and compose them in your server config.

## Recommended structure

```
src/
  halide/
    builder.ts        # Single call to defineHalide(), exports factories
    types.ts          # Shared types (TClaims, TLogScope)
  routes/
    health.ts         # Public routes
    users.ts          # User-related routes
    profile.ts        # Private/authenticated routes
    proxy.ts          # Proxy routes
    index.ts          # Barrel export of all route arrays
  server.ts           # Assembles config and starts the server
```

## Shared builder

Call `defineHalide()` once in a dedicated module, passing your global types. This exports typed `apiRoute`, `proxyRoute`, `createServer`, and `createApp` factories for use across your project.

```ts
// src/halide/builder.ts
import { defineHalide } from 'halide';
import type { UserClaims, LogScope } from './types';

export const { apiRoute, proxyRoute, createServer, createApp } = defineHalide<
  UserClaims,
  LogScope
>();
```

## Shared types

Colocate your claim and log scope types with the builder so all route files share the same definitions.

```ts
// src/halide/types.ts
export interface UserClaims {
  sub: string;
  role: 'admin' | 'user';
}

export interface LogScope {
  requestId: string;
  userId?: string;
}
```

## Route files

Each route file imports the factory from the shared builder and exports an array of routes.

```ts
// src/routes/health.ts
import { apiRoute } from '../halide/builder';

export const healthRoutes = [
  apiRoute({
    access: 'public',
    path: '/health',
    handler: async (_ctx, _app) => ({ status: 'ok' }),
  }),
];
```

```ts
// src/routes/users.ts
import { z } from 'zod';
import { apiRoute } from '../halide/builder';

const CreateUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
});

type CreateUserBody = z.infer<typeof CreateUserSchema>;

export const userRoutes = [
  apiRoute<CreateUserBody>({
    access: 'public',
    method: 'post',
    path: '/users',
    requestSchema: CreateUserSchema,
    handler: async (ctx) => ({
      id: crypto.randomUUID(),
      email: ctx.body.email,
      name: ctx.body.name,
    }),
  }),
];
```

```ts
// src/routes/profile.ts
import { apiRoute } from '../halide/builder';

export const profileRoutes = [
  apiRoute({
    access: 'private',
    path: '/profile',
    authorize: (_ctx, app) => app.claims?.role === 'admin',
    handler: async (_ctx, app) => ({ user: app.claims?.sub }),
  }),
];
```

## Barrel export

Re-export all route arrays from a single entry point for clean imports.

```ts
// src/routes/index.ts
export { healthRoutes } from './health';
export { userRoutes } from './users';
export { profileRoutes } from './profile';
export { usersProxyRoute } from './proxy';
```

## Server assembly

Import route arrays and spread them into the server config.

```ts
// src/server.ts
import { createServer } from './halide/builder';
import { healthRoutes, userRoutes, profileRoutes, usersProxyRoute } from './routes';

const server = createServer({
  apiRoutes: [...healthRoutes, ...userRoutes, ...profileRoutes],
  proxyRoutes: [usersProxyRoute],
  security: {
    auth: {
      strategy: 'bearer',
      secret: () => process.env.JWT_SECRET ?? '',
    },
  },
});

server.start();
```

## Why this works

The `defineHalide()` call only pre-bakes TypeScript generics (`TClaims`, `TLogScope`) so your handlers get proper typing. The `apiRoute()` and `proxyRoute()` factories produce plain data objects that `createServer` reads and registers on the Hono app.

This means:

- **No circular dependencies** — routes don't import the server, the server imports routes
- **Conditional routes** — you can include/exclude route groups based on environment or flags
- **Deep nesting** — routes can live in any directory structure
- **Independent testing** — route handlers are plain async functions, easy to test in isolation

## Monofile vs. split

For small projects with a handful of routes, defining everything inline in `server.ts` is fine. As your route count grows, splitting into files becomes the clearer approach. The two patterns are interchangeable — the runtime behavior is identical.
