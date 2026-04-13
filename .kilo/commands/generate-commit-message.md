---
description: Generate conventional commit messages for workspace and submodules
agent: code
output: markdown
---

## Steps

1. Run `git submodule status` to identify any submodules in the workspace.
2. For each submodule, `cd` into it and run `git diff --staged` or `git diff` to inspect changes.
3. Run `git diff --staged` or `git diff` in the main workspace to inspect changes.
4. For each location (main workspace + each submodule with changes), determine the appropriate conventional commit type (feat, fix, docs, style, refactor, perf, test, chore, etc.).
5. Identify the affected scope if applicable (e.g., component, module, service, file path).
6. Summarize the main purpose of the change in a concise imperative sentence.
7. Include additional context in the body if needed (optional, keep minimal).
8. Output ONLY the final conventional commit message text for each location. Do not include diff snippets, commentary, or explanations.
9. Use bullet point formatting to summarize points after the main header.
10. Output each message as a markdown code block, clearly labeled with the location (e.g., `[main]` or `[submodule: path/to/submodule]`).
11. Add a heading above each code block indicating the location (e.g., `### [main]` or `### [submodule: projects/something]`).
12. NEVER CHANGE MODES
13. EXAMPLE OUTPUT FORMAT:

### [main]

```
refactor(config): migrate config storage to SignalDB and simplify service APIs
- Replace LowDB with Signaldb for config persistence
- Update ConfigStorage to use async CRUD operations
- Convert ConfigService to async/await and typed ConfigDocument
- Adjust settings component to use new signal-based filtering
- Remove unused LogService injection
- Update RPC service types and response handling
- Add node type to tsconfig.app.json
```

### [submodule: projects/something]

```
fix(cli): resolve race condition in worker thread initialization
- Add mutex lock for shared state access
- Ensure proper cleanup on worker termination
```
