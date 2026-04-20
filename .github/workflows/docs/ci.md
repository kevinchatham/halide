## Automated Testing & Build

`.github/workflows/ci.yml`

Executes automated linting, building, and unit testing on every push to `main` and on every pull request targeting `main`. A manual trigger is also available via `workflow_dispatch`.

**Jobs:**

| Job     | Purpose                                    |
| ------- | ------------------------------------------ |
| `lint`  | Runs `npm run lint` (Biome checks)         |
| `build` | Runs `npm run build` (tsup → dist/)        |
| `test`  | Runs `npm run test` (Vitest with coverage) |

All three jobs run in parallel on `ubuntu-latest` with Node.js 24.

```mermaid
graph TD
    A[Push/PR to main / workflow_dispatch] --> B[Parallel Jobs]
    B --> C[Lint]
    B --> D[Build]
    B --> E[Test]
        C --> C1[Setup Node 24]
        C1 --> C2[npm ci]
        C2 --> C3[npm run lint]

        D --> D1[Setup Node 24]
        D1 --> D2[npm ci]
        D2 --> D3[npm run build]

        E --> E1[Setup Node 24]
        E1 --> E2[npm ci]
        E2 --> E3[npm run test]
```
