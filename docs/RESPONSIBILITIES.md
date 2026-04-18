# 🧭 bSPA Responsibility Diagram (Reference Model)

## High-level architecture

```text
┌──────────────────────────────┐
│          CLIENT LAYER         │
│──────────────────────────────│
│  SPA (Angular/React/etc)     │
│  Mobile Apps                 │
└──────────────┬───────────────┘
               │ HTTPS (same-origin via bSPA)
               ▼
┌──────────────────────────────────────────────┐
│               bSPA (YOU OWN THIS)            │
│──────────────────────────────────────────────│
│  SPA Hosting                                 │
│  Route Definitions (/api, /bff)              │
│  JWT Validation (optional JWKS/secret)       │
│  Identity Extraction                         │
│  Identity Mapping (claims → headers)         │
│  Access Control (route-level)                │
│  Request Composition (handlers)              │
│  Proxy (escape hatch)                        │
│  Retries (bounded, per-route)                │
│  Timeouts                                    │
│  Observability hooks (request-level)         │
└──────────────┬───────────────────────────────┘
               │ internal network calls
               ▼
┌──────────────────────────────────────────────┐
│        INGRESS / EDGE / PLATFORM LAYER       │
│ (NOT bSPA responsibility)                    │
│──────────────────────────────────────────────│
│  TLS termination                             │
│  WAF / rate limiting                         │
│  External API exposure policies              │
│  Global traffic routing                      │
│  DDoS protection                             │
│  (e.g. API Gateway / Ingress Controller)     │
└──────────────┬───────────────────────────────┘
               │ cluster internal traffic
               ▼
┌──────────────────────────────────────────────┐
│           SERVICE MESH LAYER                 │
│ (e.g. Istio)                                 │
│──────────────────────────────────────────────│
│  Service discovery                           │
│  mTLS                                        │
│  Retry policies (service-to-service)         │
│  Circuit breaking                            │
│  Load balancing                              │
└──────────────┬───────────────────────────────┘
               ▼
┌──────────────────────────────────────────────┐
│           BACKEND SERVICES                   │
│──────────────────────────────────────────────│
│  Users Service                               │
│  Products Service                            │
│  Orders Service                              │
│  etc.                                        │
│                                              │
│  (May or may not validate JWT independently) │
└──────────────────────────────────────────────┘
```

# 🧠 Key Idea: “Where responsibility lives”

This is the most important part of the model.

## 🔵 bSPA = Application Contract Layer

bSPA owns:

* “What can the SPA call?”
* “What does identity look like in backend requests?”
* “How are backend services shaped for frontend consumption?”
* “How do we ensure consistent SPA backend structure?”

👉 It is **code-level application logic**

## 🟡 Edge / Ingress Layer = Traffic Control

Owned by infrastructure (not bSPA):

* rate limiting
* WAF rules
* TLS
* global routing
* external exposure policies

👉 It is **network-level governance**

## 🟣 Service Mesh = Service Reliability Layer

e.g. Istio

Owns:

* service-to-service retries
* mTLS
* circuit breaking
* internal load balancing

👉 It is **distributed systems reliability**

## 🟢 Backend Services = Domain Logic

Own:

* business logic
* data access
* internal validation (optional)
* domain rules

👉 It is **business behavior**

# 🧭 The critical boundary statement

This is the sentence you should repeat internally:

> bSPA defines the frontend-to-backend application contract.
> It does not manage traffic, infrastructure security, or service-to-service communication.

# 🔥 Why this diagram is powerful (for adoption)

This diagram does 3 important things:

## 1. Prevents scope creep

It explicitly excludes:

* rate limiting
* caching policies
* WAF behavior
* service mesh concerns

👉 no “just one more feature” expansion into infra land

## 2. Justifies existence vs API gateways

It shows:

> “We are not replacing ingress or APIM—we are above it in the application stack.”

## 3. Clarifies why bSPA exists at all

Without this diagram, critics will say:

> “This is just Express + proxy logic.”

With it:

> “This is the application contract layer between SPA and backend systems.”

# 🧠 The most important mental model shift

Traditional thinking:

> Request flows through infrastructure → reaches backend

Your model:

> SPA defines intent → bSPA interprets it → infra executes it

That inversion is the real product idea.

# 🧩 Optional README version (simplified diagram)

If you want something lighter for docs:

```text
SPA / Mobile
    ↓
bSPA
    ↓
Service Mesh
    ↓
Backend Services
```

