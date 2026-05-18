# defineHalide()

`defineHalide()` is the entry point for building a Halide application. It returns a typed builder with pre-baked factories for creating routes and servers.

## How it works

`defineHalide()` takes a single type parameter — a `HalideContext` type — and extracts its claims and log scope types. The returned builder has `apiRoute`, `proxyRoute`, `createServer`, and `createApp` factories that are already typed with those extracted types.

```ts
import { defineHalide, type HalideContext } from 'halide';

type App = HalideContext<UserClaims, LogScope>;
const { apiRoute, proxyRoute, createServer, createApp } = defineHalide<App>();
```

The single type parameter is a `HalideContext<TClaims, TLogScope>`, not two separate parameters. This is the key design: you define a `HalideContext` type that bundles your claims and log scope together, then pass that type to `defineHalide()`.

## Without custom types

When no custom types are needed, call `defineHalide()` with no type parameter. It defaults to `HalideContext<unknown, unknown>`:

```ts
import { defineHalide } from 'halide';

const { apiRoute, createServer } = defineHalide();
```

## Returned builder

The builder exposes four factories:

| Factory                             | Description                                                                                                                  |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `apiRoute<TBody, TResponse>(input)` | Creates a typed API route. Only body and response types need to be specified per route — claims and log scope are pre-baked. |
| `proxyRoute(input)`                 | Creates a typed proxy route. Claims and log scope types are pre-baked.                                                       |
| `createServer(config)`              | Creates a full server with lifecycle methods (`start`, `stop`, `ready`).                                                     |
| `createApp(config)`                 | Builds a Hono app with registered routes (does not start a server). Useful for testing.                                      |

## Type extraction

Internally, `defineHalide` uses `ExtractClaims<TApp>` and `ExtractLogScope<TApp>` to derive the claims and log scope types from the `HalideContext` type. This means you can pass any type that has `claims` and `logger` fields — it doesn't have to be exactly `HalideContext`.

## Shared builder pattern

For multi-file projects, call `defineHalide()` once in a dedicated module and export the factories. All route files then import from this shared builder, ensuring consistent typing across the project:

```ts
// src/halide/builder.ts
import { defineHalide, type HalideContext } from 'halide';
import type { UserClaims, LogScope } from './types';

type App = HalideContext<UserClaims, LogScope>;

export const { apiRoute, proxyRoute, createServer, createApp } = defineHalide<App>();
```

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

See [Project organization](3-project-organization.md) for the full recommended structure.

## Common mistake

`defineHalide()` takes one type parameter, not two. This is wrong:

```ts
// WRONG — defineHalide takes one type param, not two
defineHalide<MyClaims, MyLogScope>();
```

Use this instead:

```ts
// CORRECT — pass a HalideContext type
type App = HalideContext<MyClaims, MyLogScope>;
defineHalide<App>();
```
