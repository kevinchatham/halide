<p align="center">
  <img src="https://github.com/kevinchatham/halide/blob/main/images/halide-logo.png?raw=true" alt="halide" width="150px" height="150px"/>
  <br/>
  <em>Stability by composition</em>
  <br/><br/>
  <a style="color:unset;" href="./LICENSE">
    <img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT License"/>
  </a>
  <a style="margin-left:8px;color:unset;" href="https://github.com/kevinchatham/halide/tree/main/docs">
    <img src="https://img.shields.io/badge/docs-1.0.0-cyan" alt="Documentation"/>
  </a>
  <img style="margin-left:8px;" src="https://img.shields.io/badge/node-%3E%3D24-1e293b" alt="Node.js"/>
  <img style="margin-left:8px;" src="https://img.shields.io/npm/v/halide" alt="npm"/>
</p>

## What is Halide?

Halide is a purpose-built, declarative BFF runtime that standardizes how your SPA communicates with backend services. It gives these concerns a shared, predictable structure, configured once rather than assembled from scratch every time.

> Halides are compounds that bond separate elements into a stable structure.

```text
Browser (SPA)
    ↓
Halide (auth, routing, composition)
    ↓
Private backend services
```

It is not an API gateway, a service mesh, or a full backend framework. It is specifically designed around SPA application boundaries.

## Why Halide?

In most SPA setups, each application carries its own ad-hoc BFF implementation. Across multiple apps this becomes a mess:

- Every SPA implements auth slightly differently, and debugging token issues across them is painful
- Proxy logic is copy-pasted between projects, drifting over time
- Frontend code ends up coupled to internal service topology (URLs, ports, paths)
- CORS configuration is repeated across services, often inconsistently
- No clear boundary between "frontend backend" and "actual backend" responsibilities

Halide provides a shared structure for all of these concerns. The result is a consistent, predictable backend layer across all your SPAs, without duplication or drift.

## What you get out of the box

- Static SPA hosting with fallback routing
- Typed API routes with validation
- Secure proxying to backend services
- Built-in auth (JWT / JWKS)
- CORS, CSP, and rate limiting
- Optional OpenAPI documentation

## Get started

```bash
npm install halide
```

```ts
import { createServer, apiRoute } from 'halide';

const server = await createServer({
  spa: {
    root: './dist/browser',
  },
  apiRoutes: [
    apiRoute({
      access: 'public',
      method: 'get',
      path: '/health',
      handler: async () => ({ status: 'ok' }),
    }),
  ],
});

await server.start();
```

The server starts on port 3001 (override with the `PORT` environment variable).

## When not to use Halide

Halide is intentionally narrow. Consider alternatives if:

- **You need complex backend orchestration or domain logic.** Halide routes and proxies requests. It is not a place for business rules or multi-service orchestration. A full backend framework or dedicated microservice is a better fit.
- **You're building a multi-service backend, not just a BFF layer.** Halide sits between a frontend and its backends. If you need inter-service communication, routing, or discovery, an API gateway or service mesh is designed for that.
- **You need fine-grained infrastructure control.** Halide abstracts away proxy configuration, TLS termination, and load balancing. If you need custom middleware chains, circuit breakers, or service-level routing policies, an API gateway gives you that control.
