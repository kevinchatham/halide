# 🧭 Agent Prompt — bSPA (SPA Backend Runtime / BFF Gateway)

You are helping design a TypeScript/Node library called **bSPA (SPA Backend Runtime / BFF Gateway)**.

This is an early-stage (`0.0.0`) infrastructure library intended to standardize how Single Page Applications (SPAs) interact with backend systems in a multi-service architecture.

---

# 1. Core Goal

Design a **type-safe SPA backend runtime** that standardizes routing, identity translation, and secure access to internal systems, with built-in observability and resilient service communication.

Specifically, it should:

* Serve SPA static assets
* Provide a secure browser-facing API boundary (BFF layer)
* Centralize authentication and identity extraction
* Eliminate CORS concerns by design
* Hide internal backend service topology from the browser
* Provide controlled access to backend systems via composition or proxying
* Ensure consistent SPA backend behavior across multiple applications/teams
* Include built-in observability and resilient transport behavior

---

# 2. Non-Goals (Important Constraints)

This system MUST NOT:

* Not implement or manage service-to-service authentication
* Not control backend service security policies
* Not replace API gateways or cloud infrastructure tools
* Not attempt to enforce trust relationships on downstream services
* Not assume backend services behave consistently or are under control
* Be a service mesh
* Be a distributed systems framework
* Be a backend-to-backend security system
* Include dynamic runtime route registration complexity
* Include infra-level API gateway features (rate limiting, WAF, etc.)

This library only governs the **browser-facing boundary layer**.

---

# 3. Core Mental Model

The system is a 3-layer architecture:

## Layer 1 — Browser (Untrusted)

* SPA runs here
* Cannot access backend services directly
* Only communicates with the BFF

## Layer 2 — BFF Gateway (Trusted Edge Runtime)

This is the library's responsibility.

Responsibilities:

* Serve SPA assets
* Validate JWT (optional but supported)
* Extract identity claims
* Enforce route-level authorization
* Shape API responses for frontend consumption
* Route requests to internal systems
* Hide backend topology from browser
* Eliminate CORS via same-origin design
* Apply retries and load balancing for service communication
* Provide observability hooks (tracing, logging)

## Layer 3 — Backend Systems (Private Mesh)

* Not exposed to the internet
* May or may not validate JWT
* Receive requests via BFF (forwarded or composed)

---

# 4. Key Design Principles

### 1. The BFF is a boundary, not a proxy tool

Routes define what the SPA is allowed to do.

### 2. Proxying is an escape hatch, not the core abstraction

Composition (handlers) is preferred over passthrough.

### 3. Identity is translated, not trusted

We do NOT define trust relationships with backend systems.

Instead, we define **identity propagation strategies** with explicit, typed transformations.

### 4. Services are first-class citizens

Backend systems are abstracted behind named service clients with typed references.

### 5. Routes define the frontend contract

Everything exposed to the SPA is explicitly declared with full type safety.

### 6. Structure is standardized

(backend systems + identity)

### 7. Behavior is runtime-managed

(retries, LB, observability)

### 8. Identity is explicitly transformed

(not implicit forwarding)

---

# 5. Proposed API Design (v0.1 direction)

## 5.1 Server Creation

```ts
import { createServer } from 'bspa';

type Claims = {
  sub: string;
  name: string;
  admin: boolean;
};

const server = createServer<Claims>({
  spa: {
    name: 'angular-spa',
    root: './dist/browser',
  },

  security: {
    cors: {
      mode: 'internal',
      origins: [
        'https://app.company.com',
        'https://admin.company.com',
      ],
    },

    csp: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'", 'https://api.company.com'],
    },

    auth: {
      strategy: 'jwt',
      jwks: 'https://idp/.well-known/jwks.json',
      audience: 'spa-clients',
    },
  },

  identity: {
    extract: (claims) => ({
      userId: claims.sub,
      displayName: claims.name,
      isAdmin: claims.admin,
    }),

    inject: {
      'x-user-id': (i) => i.userId,
      'x-user-name': (i) => i.displayName,
      'x-user-admin': (i) => String(i.isAdmin),
  },

  routes: [
    // Public config endpoint (SPA bootstrap)
    {
      path: '/bff/config',
      access: 'public',
      handler: () => ({
        env: process.env.NODE_ENV,
      }),
    },

    // Composed route (preferred pattern)
    {
      path: '/api/users',
      access: 'private',
      handler: async ({ identity }) => {
        return fetch('http://users.internal/users', {
          headers: {
            'x-user-id': identity.userId,
          },
        });
      },
    },
        });
      },
    },
        });
      },
    },

    // Resilient proxy route (transport-aware)
    {
      type: 'proxy',
      path: '/api/products',
      access: 'private',
      target: 'http://products.internal',
      proxyPath: '/products',
      identity: 'inject',
      retries: true,
      observe: true,
    },

    // Auth-gated route
    {
      path: '/bff/admin',
      access: 'private',
      authorize: (ctx) => ctx.identity.isAdmin,
      handler: ({ identity }) => ({
        user: identity,
        data: 'secret',
      }),
    },
  ],
});

await server.start();
```

---

# 6. Core Abstractions

## 6.1 routes

Primary interface for SPA backend contract.

Two modes:

### A. Composed route (preferred)

```ts
{
  path: '/api/users',
  access: 'private',
  handler: ({ identity }) => {}
}
```

### B. Proxy route (escape hatch, now transport-aware)

```ts
{
  type: 'proxy',
  path: '/api/products',
  target: 'http://products.internal',
  proxyPath: '/products',
  identity: 'inject',
  retries: true,
  observe: true,
}
```

Proxy is no longer dumb forwarding:

* Retries enabled per route
* Observability hooks enabled
* Identity injection explicit

---

## 6.2 auth + identity

Authentication is handled at the BFF boundary.

### Key concept:

We do NOT define "trust modes".

Instead we define an explicit, typed identity transformation system:

```ts
identity: {
  extract: (claims) => ({
    userId: claims.sub,
    displayName: claims.name,
    isAdmin: claims.admin,
  }),

  inject: {
    'x-user-id': (i) => i.userId,
    'x-user-name': (i) => i.displayName,
    'x-user-admin': (i) => String(i.isAdmin),
  },
}
```

Meaning:

* JWT is validated at the BFF
* Claims are extracted via a typed `extract` function
* Identity is injected into downstream requests via typed `inject` mappings
* No magic strings or implicit forwarding
* Fully typed transformation functions
* Explicit control over identity shape

JWT supports:

* Secret OR JWKS
* Audience validation included
* Safe defaults enforced

---

## 6.3 security

```ts
security: {
  cors: {
    mode: 'internal',
    origins: [
      'https://app.company.com',
      'https://admin.company.com',
    ],
  },

    csp: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'", 'https://api.company.com'],
    },
}
```

Goal:

* Eliminate browser CORS complexity
* Enforce safe defaults for SPA hosting
* CORS defaults to `"internal"` with escape hatch for explicit origins or wildcard
* CSP based on helmet, but extendable with structured config

---

## 6.4 observability (NEW CORE FEATURE)

This is now part of runtime, not optional middleware.

```ts
observability: {
  tracing: 'request-id',
  logging: {
    level: 'info',
    includeBody: false,
  },
}
```

---

# 7. Runtime Behavior Model

Each request goes through:

```
Browser
  ↓
Route match
  ↓
Auth check
  ↓
Identity extraction
  ↓
Handler OR Proxy
  ↓
Response
```

---

# 8. What This Library IS

This library is:

> A type-safe application gateway runtime for SPAs that standardizes identity, routing, and resilient communication with internal systems.

Or more precisely:

> A browser-facing application gateway runtime that standardizes SPA backend behavior and enforces identity-aware routing to private backend systems.

Not:

* A proxy library
* A BFF helper
* A framework

But:

* A **runtime contract layer**

---

# 9. What This Library is NOT

It is NOT:

* An API gateway replacement
* A service mesh
* A distributed systems framework
* A backend-to-backend security system
* A plugin ecosystem

---

# 10. Success Criteria

The library is successful if:

* Multiple SPAs can adopt it with consistent backend patterns
* Teams stop writing custom Express BFF servers
* Authentication + routing behaves consistently across apps
* Backend service URLs are never exposed to frontend code
* Developers stop thinking about CORS and proxy wiring entirely
* Same structure is used everywhere (consistency across SPAs)
* Strong typing everywhere (no runtime guessing of service names or identity fields)
* Secure-by-default boundary (JWT validated at edge)
* Production-ready transport behavior (retries + LB included)
* Clear identity model (no ambiguity about how claims become headers)

---

# 11. Key Design Philosophy

> "The SPA should only see a controlled, intentional API surface. Everything else is hidden behind a single, opinionated runtime boundary."

---

# 12. Key Insight (Why this version works)

Three critical commitments:

### 1. Structure is standardized

(routes + identity)

### 2. Behavior is runtime-managed

(retries, LB, observability)

### 3. Identity is explicitly transformed

(not implicit forwarding)

That combination is what makes this **hard to casually replace with Express glue code**.
