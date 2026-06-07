# Configuration Validation

Halide validates server configuration at startup using Zod schemas with cross-field checks via `superRefine`. Validation runs synchronously (or asynchronously if auth secret is a function).

## Zod Schema Structure

Validation is composed of nested schemas:

| Schema                | Purpose                                                                                                                                  |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `appSchema`           | Validates `apiPrefix`, `fallback`, `name`, `port`, `root`. Ensures `port` is integer 1-65535.                                            |
| `corsSchema`          | Validates CORS fields. Rejects wildcard origin + `credentials: true`.                                                                    |
| `cspSchema`           | Validates CSP directive keys are camelCase. Strict mode rejects unknown keys (kebab-case).                                               |
| `bearerAuthSchema`    | Validates bearer auth: `secret` required (non-empty string or function), `secretTtl` non-negative integer, `algorithms` non-empty array. |
| `jwksAuthSchema`      | Validates JWKS auth: `jwksUri` required string, `algorithms` non-empty array.                                                            |
| `apiRouteSchema`      | Validates API route fields. Ensures `path` starts with `/`.                                                                              |
| `proxyRouteSchema`    | Validates proxy route fields. Ensures `path` and `proxyPath` start with `/`.                                                             |
| `rateLimitSchema`     | Validates `maxEntries` is positive integer.                                                                                              |
| `observabilitySchema` | Validates `maxCollect` is positive integer, max 1MB (1048576 bytes).                                                                     |
| `serverConfigSchema`  | Top-level schema with cross-field validation via `superRefine`.                                                                          |

All sub-schemas use `.strict()` to reject unknown keys.

## Cross-Field Validation Rules

Enforced by `serverConfigSchema.superRefine()`:

| Rule                                                             | Error Message                                                  |
| ---------------------------------------------------------------- | -------------------------------------------------------------- |
| CORS wildcard origin (`*`) incompatible with `credentials: true` | `Wildcard origin cannot be used with credentials: true`        |
| Private routes require `security.auth` configured                | `security.auth is required when routes have access: 'private'` |
| Proxy route `target` must be valid http/https URL                | `Proxy route target is not a valid URL: {target}`              |
| Proxy route requires at least one `methods` entry                | `Proxy route requires at least one method`                     |
| API route paths must start with `/`                              | `Route path must start with / (api): {path}`                   |
| Proxy route paths must start with `/`                            | `Route path must start with / (proxy): {path}`                 |
| Proxy route `proxyPath` must start with `/`                      | `Proxy route proxyPath must start with /: {proxyPath}`         |
| API routes require a `handler` function                          | `API route requires handler`                                   |

## Field-Level Validation Rules

Enforced by individual Zod schemas:

| Field                      | Rule                                        |
| -------------------------- | ------------------------------------------- |
| `app.port`                 | Must be integer between 1 and 65535         |
| `auth.secret` (bearer)     | Required, must not be empty string          |
| `auth.secretTtl`           | Must be non-negative integer (seconds)      |
| `auth.algorithms`          | Must be non-empty array of strings          |
| `auth.jwksUri` (jwks)      | Required string                             |
| `rateLimit.maxEntries`     | Must be positive integer                    |
| `observability.maxCollect` | Must be positive integer, max 1048576 (1MB) |

## Async Secret Validation

When `auth.secret` is a function that returns a `Promise`, synchronous validation (`validateServerConfigSync`) will fail with:

> Function-based auth secrets cannot be validated synchronously. Pass a string secret, or use `validateServerConfig` for async secret resolution.

Use `validateServerConfig()` (async) to resolve and validate function-based secrets. The async validator:

1. Calls the secret function
2. If it returns a Promise, awaits the resolved value
3. Checks the resolved value is a non-empty string
4. Catches rejection errors and reports them as validation errors

## Warnings

Non-blocking warnings are emitted via logger (not thrown):

| Condition                                      | Warning                                                                                                                                                                                                             |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rate limiting configured without `redisClient` | `Rate limiting is configured without redisClient. Fallback to in-memory store is per-instance only and will not share state across multiple server instances; configure redisClient for distributed rate limiting.` |

## Validation API

| Function                                    | Behavior                                                                                            |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `validateServerConfigSync(config, logger?)` | Synchronous validation. Throws on error. Emits warnings via logger. Rejects function-based secrets. |
| `validateServerConfig(config)`              | Async validation. Returns `ValidationResult`. Resolves function-based secrets.                      |
| `validateAuthSecret(auth?)`                 | Async validation of auth secret only. Returns `ValidationResult`.                                   |

Both return/throw with structured `ValidationError` objects containing `field` (dot-notation path) and `message`.

```typescript
type ValidationError = {
  field: string; // e.g., 'security.auth.secret'
  message: string;
};

type ValidationResult = {
  errors: ValidationError[];
  valid: boolean;
  warnings?: ValidationError[];
};
```
