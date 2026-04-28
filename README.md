<p align="center">
  <img src="https://github.com/kevinchatham/halide/blob/main/images/halide-logo.png?raw=true" alt="halide" width="150px" height="150px"/>
  <br/>
  <em>Stability by composition</em>
  <br/><br/>
  <a href="https://github.com/kevinchatham/halide/tree/main/LICENSE">
    <img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT License"/>
  </a>
  <a style="margin-left:8px" href="https://github.com/kevinchatham/halide/tree/main/docs">
    <img src="https://img.shields.io/badge/docs-0.0.9-cyan" alt="Documentation"/>
  </a>
  <img style="margin-left:8px;" src="https://img.shields.io/npm/v/halide" alt="npm"/>
  <a style="margin-left:8px;" href="https://nodejs.org">
    <img src="https://img.shields.io/badge/node-%3E%3D24-1e293b" alt="Node.js"/>
  </a>
</p>

## What is Halide?

Halide is a purpose-built, declarative BFF runtime that standardizes how your SPA communicates with backend services. It gives these concerns a shared, predictable structure, configured once rather than assembled from scratch every time.

```text
Browser (SPA)
    ↓
Halide (auth, routing, composition)
    ↓
Private backend services
```

Halide is not an API gateway, a service mesh, or a full backend framework. It is specifically designed around SPA application boundaries.

## Get started

Run Halide in an empty project (`npm init`) or add it directly to your existing frontend project. The server runs as a standalone process alongside your SPA build tooling.

```bash
npx halide init
```

This automatically:

1. Detects your package manager
2. Installs `halide`
3. Scaffolds a `server.ts` entry point with a health route
4. Creates `tsconfig.server.json` and updates project references
5. Adds `halide:start` and `halide:build` scripts to `package.json`
6. Installs agent skill via `npx skills add kevinchatham/halide`

### Manual Installation

```bash
npm install halide
```

```ts
// routes.ts
import { apiRoute, proxyRoute } from 'halide';

export const healthRoute = apiRoute({
  access: 'public',
  method: 'get',
  path: '/api/health',
  handler: async () => ({ status: 'ok' }),
});

export const userProxyRoute = proxyRoute({
  access: 'private',
  methods: ['get', 'post'],
  path: '/api/users',
  target: 'http://user-svc:3000',
});
```

```ts
// server.ts
import { healthRoute, userProxyRoute } from './routes';
import { createServer, type ServerConfig } from 'halide';

const config: ServerConfig = {
  spa: {
    root: './browser',
  },
  security: {
    auth: {
      strategy: 'jwks',
      jwksUri: 'https://my-tenant.us.auth0.com/.well-known/jwks.json',
      audience: 'https://api.example.com',
    },
  },
  apiRoutes: [healthRoute],
  proxyRoutes: [userProxyRoute],
};

const server = createServer(config);

server.start((port) => console.log(`Serving on ${port}`));
```

```
npx tsx server.ts
```

> The server starts on port 3553. Override with `spa.port` or the `PORT` environment variable.

## Why Halide?

In most SPA setups, each application carries its own ad-hoc BFF implementation. Across multiple apps this becomes a mess:

- Every SPA implements auth slightly differently, and debugging token issues across them is painful
- Proxy logic is copy-pasted between projects, drifting over time
- Frontend code ends up coupled to internal service topology (URLs, ports, paths)
- CORS configuration is repeated across services, often inconsistently
- No clear boundary between "frontend backend" and "actual backend" responsibilities

Halide provides a shared structure for all of these concerns, configured once and consistent across every SPA:

- Static SPA hosting with fallback routing
- Typed API routes with validation
- Secure proxying to backend services
- Built-in auth (JWT / JWKS)
- CORS, CSP, and rate limiting
- Optional OpenAPI documentation

The result is a predictable backend layer across all your SPAs, without duplication or drift.

## When not to use Halide

Halide is opinionated but extensible. API route handlers are arbitrary async functions, and proxy routes support per-route `authorize`, `transform`, and `identity` hooks. Consider alternatives if:

- **You need direct control over the HTTP layer.** Halide abstracts Hono behind a typed config. If you need to set custom response headers/status codes, stream responses, handle file uploads, or run arbitrary Hono middleware, a full backend framework gives you that access.
- **You're building a multi-service backend, not just a BFF layer.** Halide sits between a frontend and its backends. If you need inter-service communication, routing, or discovery, an API gateway or service mesh is designed for that.
- **You need infrastructure-level proxy control.** Halide provides per-route request transformation, identity header injection, and path rewriting, but does not expose response transformation, circuit breakers, TLS termination, load balancing, or retry policies. An API gateway or service mesh is a better fit for those.
