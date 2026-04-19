---
description: Run SonarQube analysis in a loop, fix issues, and improve test coverage to >80%
agent: code
---

## Overview

This command runs `npm run sonar` iteratively, uses the SonarQube MCP server to identify code quality issues and coverage gaps, fixes them, and repeats until all issues are resolved and coverage exceeds 80%. If stuck, it stops and asks the user how to proceed.

## Steps

### Phase 1: Initial Setup

1. Run `npm run sonar` to execute tests and upload results to SonarQube.
2. Wait for the scan to complete. If it fails, fix the build/test errors first, then retry.
3. Search for the project key using the SonarQube MCP tool `sonarqube_search_my_sonarqube_projects` with `q: "halide"`. Note the project key.

### Phase 2: Fix Code Quality Issues

4. Search for open issues using `sonarqube_search_sonar_issues_in_projects` with:
   - `projects`: [project key]
   - `issueStatuses`: ["OPEN"]
   - Sort by severity (BLOCKER, HIGH first)

5. For each open issue:
   a. Read the file and line referenced in the issue.
   b. Understand the problem using the issue message and rule details (use `sonarqube_show_rule` if needed).
   c. Fix the issue in the source code.
   d. After fixing a batch of issues, run the pre-commit workflow: `npm run lint:fix` → `npm run typecheck` → `npm run test`.
   e. If any step fails, fix the errors before continuing.

6. Search for security hotspots using `sonarqube_search_security_hotspots` with:
   - `projectKey`: [project key]
   - `status`: ["TO_REVIEW"]

7. For each hotspot:
   a. Get details using `sonarqube_show_security_hotspot`.
   b. Review the code and determine if it needs fixing or can be marked SAFE.
   c. If it needs fixing, fix the code and rerun tests.
   d. If safe, mark it using `sonarqube_change_security_hotspot_status` with status "REVIEWED" and resolution "SAFE".

### Phase 3: Improve Test Coverage

8. Get current coverage metrics using `sonarqube_get_component_measures` with:
   - `projectKey`: [project key]
   - `metricKeys`: ["coverage", "lines_to_cover", "uncovered_lines", "branch_coverage", "uncovered_conditions"]

9. If coverage is below 80%, search for files with low coverage using `sonarqube_search_files_by_coverage`:
   - `projectKey`: [project key]
   - `maxCoverage`: 80

10. For each file with low coverage:
    a. Get detailed line-by-line coverage using `sonarqube_get_file_coverage_details` with the file key.
    b. Identify uncovered lines and branches.
    c. Read the source file to understand what the uncovered code does.
    d. Read the existing test file (if any) at `src/<path>/<filename>.spec.ts`.
    e. Write new tests to cover the uncovered lines. Follow the existing test patterns:
       - Vitest with `globals: true` (no imports needed for `describe`/`it`/`expect`/`vi`)
       - Use `vi.mock()` for mocking dependencies
       - Test environment is `node`
    f. Run `npm run test` to verify tests pass and coverage improves.

### Phase 4: Iterate

11. After fixing issues and adding tests, run `npm run sonar` again to re-scan.
12. Repeat Phases 2-3 until:
    - No more OPEN issues with severity BLOCKER or HIGH
    - All security hotspots are reviewed
    - Coverage is above 80% on all metrics (branches, functions, lines, statements)

### Phase 5: Stuck Handling

13. If you encounter any of these situations, STOP and tell the user:
    - An issue that you don't understand how to fix (explain the issue and why you're unsure)
    - A coverage gap where you can't determine what tests to write (explain what code is uncovered and why it's unclear)
    - A test that keeps failing despite your fixes (show the error and what you've tried)
    - A SonarQube rule that seems incorrect for this codebase (explain the rule and why it may not apply)
    - Any circular problem where fixing one thing breaks another

14. When stuck, provide the user with:
    - What you were trying to do
    - What specific problem you encountered
    - What you've already tried
    - Ask: "How would you like me to proceed?"

### Phase 6: Final Verification

15. Once all issues are fixed and coverage is above 80%:
    - Run `npm run lint:fix` → `npm run typecheck` → `npm run test` one final time
    - Run `npm run sonar` for a final scan
    - Verify quality gate status using `sonarqube_get_project_quality_gate_status`
    - Report the final coverage numbers and remaining issue count to the user

## Important Notes

- Always run `npm run lint:fix` before committing any changes to ensure code style compliance.
- Biome owns `.ts`, `.css`, `.json` files. Prettier owns `.html`, `.yml`, `.yaml`, `.md`. Do not cross over.
- Use the `Logger` interface, not `console.log`.
- Use `node:` prefix for Node.js built-in modules.
- Always annotate return types on exported functions.
- Test files are co-located as `*.spec.ts` alongside source files.
- Coverage thresholds are enforced at 80% for branches, functions, lines, and statements.
- Do NOT commit changes unless the user explicitly asks you to.
