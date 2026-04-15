---
description: Generate conventional commit messages for the workspace
agent: code
output: markdown
---

## Steps

1. Run `git diff --staged` or `git diff` in the main workspace to inspect changes.
2. Determine the appropriate conventional commit type (feat, fix, docs, style, refactor, perf, test, chore, etc.).
3. Identify the affected scope if applicable (e.g., component, module, service, file path).
4. Summarize the main purpose of the change in a concise imperative sentence.
5. Include additional context in the body if needed (optional, keep minimal).
6. Output ONLY the final conventional commit message text. Do not include diff snippets, commentary, or explanations.
7. Use bullet point formatting to summarize points after the main header.
8. Output the message as a markdown code block, clearly labeled with the location `[main]`.
9. Add a heading above the code block indicating the location (e.g., `### [main]`).
10. NEVER CHANGE MODES
11. EXAMPLE OUTPUT FORMAT:

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
