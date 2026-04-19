# ⚖️ The key design decision

**Core runtime + adapters**

- bSPA owns logic
- adapters translate to runtime (Express, Hono, Fastify)
- slightly more work upfront
- but:
  - future-proof
  - cleaner mental model
  - better open-source story

# 🧠 The correct mental model

Think of bSPA like this:

```text id="adapter_model"
        bSPA Core (framework-agnostic)
     ┌──────────────────────────────┐
     │ routing                     │
     │ identity                   │
     │ retries / observability    │
     └──────────────┬──────────────┘
                    │
     ┌──────────────┴──────────────┐
     │        Adapter Layer         │
     ├──────────────┬──────────────┤
     │ Express      │ Hono         │
     │ Fastify      │ (future...)  │
     └──────────────┴──────────────┘
                    │
             HTTP runtime
```

# 🧠 What this means in practice

## 1. Your current API must NOT expose Express types

This is critical.

Bad (locks you in):

```ts
handler: (req: Request, res: Response) => {};
```

Good:

```ts
handler: (ctx: Context) => {};
```

Where `Context` is yours:

```ts id="ctx_model"
type Context<TClaims, TIdentity> = {
  request: {
    method: string;
    path: string;
    headers: Record<string, string>;
  };

  claims?: TClaims;
  identity?: TIdentity;

  params: Record<string, string>;
};
```

👉 This is your **real abstraction boundary**

## 2. Adapters only implement “HTTP wiring”

### Express adapter:

- maps Express req → Context
- maps response back
- registers routes

### Hono adapter:

- maps Hono context → your Context
- same core runtime

👉 adapters should be _boring_

## 3. Core runtime must not know Express exists

This is the rule that keeps you safe:

> bSPA core should never import Express, Hono, Fastify, or any HTTP framework.

Only adapters do.

# ⚙️ Example architecture

## Core

```ts id="core_api"
createRuntime({
  routes,
  identity,
  auth,
});
```

## Adapter (Express)

```ts id="express_adapter"
createExpressAdapter(runtime).listen(3000);
```

## Adapter (Hono)

```ts id="hono_adapter"
createHonoAdapter(runtime).serve();
```

# 🧠 The correct constraint

You want:

> One runtime, many HTTP bindings

NOT:

> One framework with plugin support

That difference is subtle but critical.

# ⚖️ Tradeoff honestly

## Adapter-based:

✔ future-proof
✔ cleaner abstraction
✔ better OSS story
✔ easier to support edge runtimes later
❌ slightly more upfront work
❌ requires discipline in API design

# 🧭 The key insight for your project

> You are building a **platform runtime**, not an Express library.

So Express should be treated as:

> a first adapter, not the foundation

# 🔥 Final recommendation (strong opinion)

### ✔ Build a core runtime abstraction first

### ✔ Treat Express as an implementation detail

### ✔ Add Hono as a second adapter early (even if experimental)
