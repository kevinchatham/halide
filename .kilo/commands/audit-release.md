---
description: Run a comprehensive pre-release validation audit to ensure the project is production-ready
agent: code
---

## Durability Principle

Prefer validating repository-declared contracts over hardcoded implementation details. Infer tooling, package manager, artifact paths, exports, and configuration from repository metadata whenever possible. Never assume a specific bundler, linter, test runner, or directory layout.

## Overview

This command performs a comprehensive pre-release audit of the project. It runs a series of checks in a defined order, reporting pass/fail for each category. The audit always runs all checks to completion and produces a full report — it never short-circuits on the first failure.

## Package Manager Detection

Before running any checks, detect the package manager by inspecting lockfiles in the project root:

- `package-lock.json` → `npm`
- `pnpm-lock.yaml` → `pnpm`
- `yarn.lock` → `yarn`
- `bun.lockb` → `bun`

Map detected package manager to commands:

| Action   | npm          | pnpm           | yarn         | bun          |
|----------|--------------|----------------|--------------|--------------|
| install  | `npm ci`     | `pnpm install` | `yarn install` | `bun install --frozen-lockfile` |
| list     | `npm ls --depth=0` | `pnpm ls` | `yarn info` | `bun ls` |
| audit    | `npm audit --omit=dev` | `pnpm audit` | `yarn audit` | `bun audit` |
| run      | `npm run <script>` | `pnpm <script>` | `yarn <script>` | `bun run <script>` |

If no lockfile is found, report a warning but proceed using `npm` as fallback.

## Script Discovery

Read `package.json` and extract available scripts. Use the repository-defined scripts for audit steps. If a script is missing, skip that check and report it as informational (not a failure):

- `lint` → Lint check
- `typecheck` → TypeScript check
- `build` → Build check
- `test` → Test & coverage check

## Execution Order

Run checks in this exact order. All checks run to completion regardless of earlier failures:

1. Git State
2. Dependency Integrity
3. Lint
4. TypeScript
5. Build
6. Tests & Coverage
7. Build Artifacts
8. Package Configuration
9. Documentation
10. Security

## Checks

### 1. Git State

Verify the working tree is clean and on the correct branch.

- Run `git status --porcelain`. If non-empty, report all uncommitted files.
- Run `git branch --show-current`. Confirm the branch name.
- Run `git log -1 --format='%s'` to show the latest commit message.
- **Fail** if there are uncommitted or untracked files (excluding `node_modules/`, `dist/`, `coverage/`).

### 2. Dependency Integrity

Verify all dependencies are installed and consistent. Use the detected package manager.

- Run the package manager's clean install command to verify a fresh install succeeds.
- Run the package manager's dependency list command to verify no broken or missing dependencies.
- Run the package manager's audit command to check production dependencies for known vulnerabilities.
- **Fail** if clean install fails, dependencies are missing or broken, or HIGH/CRITICAL vulnerabilities exist.
- LOW and MODERATE vulnerabilities are informational only — report them but do not fail.

### 3. Lint

Verify all code passes linting.

- If a `lint` script exists in `package.json`, run it using the detected package manager.
- **Fail** if the lint command exits with a non-zero code.
- If no `lint` script exists, report as informational and skip. Do NOT auto-fix — this is a validation gate.

### 4. TypeScript

Verify type-checking passes.

- If a `typecheck` script exists in `package.json`, run it using the detected package manager.
- **Fail** if the typecheck command exits with a non-zero code.
- If no `typecheck` script exists, report as informational and skip.

### 5. Build

Verify the project builds successfully.

- If a `build` script exists in `package.json`, run it using the detected package manager.
- **Fail** if the build command exits with a non-zero code.
- If no `build` script exists, report as informational and skip artifact validation (step 7).

### 6. Tests & Coverage

Verify all tests pass and coverage meets thresholds.

- If a `test` script exists in `package.json`, run it using the detected package manager.
- **Fail** if the test command exits with a non-zero code (tests failed).

Coverage validation (only if the test command produces coverage output):

- Detect coverage tool from output or project config files:
  - `vitest.config.ts` / `vitest.config.js` → Vitest coverage
  - `jest.config.js` / `jest.config.ts` → Jest coverage
  - `c8` or `nyc` config in `package.json` → c8/nyc coverage
- If a coverage threshold is configured in the project's config file, validate against those values.
- If no project thresholds are configured, use defaults:
  - Branches >= 80%
  - Functions >= 80%
  - Lines >= 80%
  - Statements >= 80%
- Parse the coverage summary from the test output or coverage report file.
- **Fail** if any coverage dimension falls below the applicable threshold.
- If the test command does not produce any coverage output, report "coverage missing" as informational. Do not fail.
- Clearly distinguish in the report:
  - "tests failed" — test runner exited with errors
  - "coverage missing" — no coverage output detected
  - "coverage below threshold" — coverage detected but below threshold

### 7. Build Artifacts

Validate that all artifact paths declared in `package.json` exist after build. Do not assume a fixed output structure.

Read `package.json` and collect all artifact paths from these fields:

- `main` — primary entry point
- `module` — ESM entry point
- `types` — TypeScript declarations
- `exports` — resolve all nested paths under `.`, conditional exports (`import`, `require`, `types`, `default`)
- `bin` — resolve all binary paths (if `bin` is a string, use it directly; if an object, collect all values)

For each resolved path:
- Verify the file or directory exists relative to the project root.
- **Fail** if any declared path is missing. Report the exact missing path.

If no artifact fields are declared, report as informational and skip.

### 8. Package Configuration

Verify `package.json` is valid and consistent for publishing.

- Parse `package.json` and verify:
  - `name` is set and non-empty
  - `version` follows semver
  - `main`, `module`, `types`, `exports`, `bin` — if present, point to valid paths
  - `files` array — if present, includes expected publishable content
  - `engines.node` — if present, is a valid semver range
  - `license` is set
- Cross-check that `package.json` version matches any version badge in `README.md` (see step 9).
- **Fail** if any declared field is malformed or points to a non-existent path.

### 9. Documentation

Verify required documentation files exist and are complete.

- Check `README.md` exists and is substantive (minimum 50 lines).
- Check `LICENSE` exists and contains license text.
- Verify `README.md` contains:
  - A project description section
  - Installation instructions
  - A code example or usage snippet
- If a version badge exists in `README.md` (pattern: any badge URL or text containing a version string like `X.Y.Z`), verify it matches `package.json` version.
- If no version badge exists, skip badge validation.
- **Fail** if `README.md` is missing, too short, or lacks required content sections.

### 10. Security

Verify no secrets, tokens, or credentials are committed. Prefer existing repository scanners over regex-only detection.

Scanner detection (check in order, use first available):
- `gitleaks` — check if binary is available via `which gitleaks` or `command -v gitleaks`
- `trufflehog` — check if binary is available
- `detect-secrets` — check if binary is available

If a scanner is found, run it against the repository and parse its output.

If no scanner is available, fall back to lightweight regex scanning on tracked files:
- API keys: `sk_live_`, `sk_test_`, `AKIA[0-9A-Z]{16}`
- Tokens: `ghp_`, `npm_[a-zA-Z0-9]{36}`, `xox[baprs]-`
- Passwords: `password`, `secret`, `token` in `.env` files or config files
- Check that `.env` files are in `.gitignore`.
- Check that `node_modules/` is in `.gitignore`.
- **Fail** if any secrets are detected or sensitive files are tracked.

## Reporting

After all checks complete, produce a summary report in this exact format:

```
# Pre-Release Audit Report

## Summary

| # | Check              | Status   | Details                          |
|---|--------------------|----------|----------------------------------|
| 1 | Git State          | PASS/FAIL| [brief detail]                   |
| 2 | Dependency Integrity| PASS/FAIL| [brief detail]                   |
| 3 | Lint               | PASS/FAIL| [brief detail]                   |
| 4 | TypeScript         | PASS/FAIL| [brief detail]                   |
| 5 | Build              | PASS/FAIL| [brief detail]                   |
| 6 | Tests & Coverage   | PASS/FAIL| [brief detail]                   |
| 7 | Build Artifacts    | PASS/FAIL| [brief detail]                   |
| 8 | Package Config     | PASS/FAIL| [brief detail]                   |
| 9 | Documentation      | PASS/FAIL| [brief detail]                   |
| 10| Security           | PASS/FAIL| [brief detail]                   |

## Result

**PASS** — All checks passed. The project is ready for release.
OR
**FAIL** — X of 10 checks failed. See details below.

## Failures

[If any checks failed, list each failure with:
- Check name
- What failed
- How to fix it]
```

## Rules

- Run all checks to completion. Never short-circuit on the first failure.
- Never auto-fix anything — this is a read-only audit.
- Never modify files.
- Never commit changes.
- Never rewrite configs.
- Never install global tools.
- Infer the package manager from lockfiles. Use repository-defined scripts from `package.json`.
- Validate declared package contracts (exports, main, types, bin) — do not assume artifact paths.
- For dependency audit, only fail on HIGH and CRITICAL severity; LOW and MODERATE are informational.
- For coverage, distinguish between: tests failed, coverage missing, coverage below threshold.
- For security, prefer existing scanners (gitleaks, trufflehog, detect-secrets); fall back to regex.
- For README version badges, only validate if a badge exists.
- Be precise with failure details — include the exact error message or missing file path.
- Output the final report as plain markdown text. Do not write a file.
