# Halide

A Node runtime for defining the backend surface of a Single Page Application. It standardizes how SPAs are served, how identity is extracted and transformed, and how frontend requests are composed or routed to internal services. Unlike API gateways, it is not infrastructure-focused or protocol-agnostic; it is designed specifically around SPA application boundaries and developer-defined backend composition logic.

Halide is intended for teams that want a consistent way to build SPA backends without re-implementing the same patterns in every project.

In three words it's a “frontend ingress gateway”

## What problem this tries to solve

In many SPA setups, each application ends up with its own backend-for-frontend (BFF) implementation. Over time this leads to:

- inconsistent auth handling
- duplicated proxy logic
- ad-hoc configuration endpoints
- backend service URLs leaking into frontend code
- CORS configuration repeated across services
- unclear boundaries between frontend and backend responsibilities

Halide provides a shared structure for these concerns.

It is not a full framework, and it does not try to replace existing backend systems.

## Core idea

Halide sits between the browser and internal services:

```
Browser (SPA)
   ↓
Halide (BFF runtime)
   ↓
Private backend services
```

Its role is to:

- serve the SPA
- validate and interpret authentication (if enabled)
- expose a controlled API surface to the frontend
- route or compose requests to backend services
- keep backend topology out of the browser

## Key concepts

### 1. SPA hosting

Halide can serve built frontend assets directly.

### 2. BFF routes

You explicitly define what the frontend is allowed to call.

Routes can either:

- call backend services via a handler (recommended)
- proxy requests to services (escape hatch)

### 4. Identity handling

Authentication happens at the BFF boundary.

Halide can:

- validate JWTs
- extract claims
- optionally propagate identity to backend services via headers

It does not assume backend services share the same auth model.

## Example

```ts
import { createServer } from 'halide';

interface JwtClaims {
  sub: string;
  name: string;
  admin: boolean;
}

const server = createServer<JwtClaims>({
  spa: {
    name: 'angular-spa',
    root: './dist/browser',
  },

  security: {
    cors: 'internal',
    csp: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'"],
    },
  },
  },

  auth: {
    strategy: 'jwt',
    jwks: 'https://idp/.well-known/jwks.json',
    identityPropagation: 'headers',
  },

  identity: {
    claims: ['sub', 'name', 'admin'],
    headers: {
      'x-user-id': 'sub',
      'x-user-name': 'name',
      'x-user-admin': 'admin',
    },
  },

  routes: [
    {
      path: '/bff/config',
      access: 'public',
      handler: () => ({
        environment: process.env.NODE_ENV,
      }),
    },

    {
      path: '/api/users',
      access: 'private',
      handler: async ({ claims }) => {
        return fetch('http://users.internal/users', {
          headers: {
            'x-user-id': claims.sub,
          },
        });
      },
    },
        });
      },
    },

    {
      path: '/bff/admin',
      access: 'private',
      authorize: ({ claims }) => claims.admin,
      handler: ({ claims }) => ({
        user: claims,
        data: 'secret',
      }),
    },
  ],
});

await server.start();
```

## Routes

Routes define the API surface exposed to the SPA.

### Handler route (preferred)

Used when you want to compose or shape data:

```ts
{
  type: 'proxy',
  path: '/api/products',
  access: 'private',
  target: 'http://products.internal',
  proxyPath: '/products',
  identity: 'inject',
  observe: true,
}
```

### Proxy route (escape hatch)

Used for simple passthrough cases:

```ts
{
  type: 'proxy',
  path: '/api/products',
  access: 'private',
  target: 'http://products.internal',
  proxyPath: '/products',
  identity: 'inject',
  observe: true,
}
```

Routes reference backend endpoints directly rather than by service name.

## Authentication model

Authentication is handled at the BFF boundary.

Halide supports extracting identity from JWTs and making it available to route handlers.

Identity can optionally be forwarded to backend services via headers.

Halide does not enforce how backend services validate or trust this identity.

## Security defaults

Halide applies conservative defaults for SPA hosting environments:

- internal CORS policy by default
- strict CSP mode available
- no direct exposure of backend service URLs to the browser

## What this is (and isn’t)

### This is:

- a runtime layer for SPA backends
- a way to standardize BFF structure across applications
- a controlled entry point to backend systems

### This is not:

- an API gateway replacement
- a service mesh
- a full backend framework
- a distributed systems abstraction layer

## Status

This project is early-stage (`0.0.0`).

The API is expected to evolve as it is used in real applications.
