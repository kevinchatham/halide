---
description: Generate pull request description
agent: code
output: markdown
---

## Steps

1. Identify available submodules/subprojects by checking for:
   - Git submodules (`.gitmodules`)
   - Nested `package.json` files in subdirectories
   - Separate git worktrees
     Common submodules in this project include: `projects/site/`, `projects/tressi/` (with `projects/cli/`, `projects/ui/`, `projects/shared/`, `projects/e2e/`).
2. Use the Question tool to ask the user which submodule they want to generate a PR description for, and specify:
   - **Submodule:** The subproject to generate PR for (e.g., `projects/site/`, `projects/tressi/`, `projects/tressi/projects/cli/`, etc.)
   - **Current branch:** The branch containing the changes (defaults to current branch if not specified)
   - **Target branch:** The branch to merge into (e.g., main, master, develop)
3. Determine the target merge branch and the current branch based on user input.
4. Find the merge base using `git merge-base <current-branch> <target-branch>`.
5. Retrieve commits with full message bodies using `git log <merge-base>..<current-branch> --format=full`. This ensures you get the complete commit messages including the body text, not just the short subject line.
6. Retrieve the full diff using `git diff <merge-base>..<current-branch>`.
7. Analyze extended commit messages (including body text) to understand intent, sequencing, and narrative.
8. Analyze diffs to identify all changes including:
   - New features and enhancements
   - Architectural changes
   - Refactoring efforts
   - Performance improvements
   - Bug fixes
   - Test coverage additions
   - Documentation updates
   - Breaking changes
9. Synthesize the branch into a single cohesive story.
10. Produce a PR description following this format (only include sections that apply):

```
**<type>(<scope>): <description>**

### Overview

[2-3 sentence summary of the PR purpose and impact]

### Major Enhancements (include if applicable)

#### [Category 1 Title]
- [Bullet describing the change]

#### [Category 2 Title]
- [Bullet describing the change]

### Architectural Changes (include if applicable)

- **[Change area]:** [Description of the architectural change]

### Testing Impact (include if applicable)

- **[Test type]:** [Description of testing added or modified]

### ⚠️ Breaking Changes (include if applicable)

- **[Change]:** [Description of breaking change and migration path if applicable]
```

11. For file references in bullet points, use markdown link format: [`filenameOrFunction()`](relative/path/file.ext)
12. Do NOT include raw diffs, commit hashes, or speculative commentary.
13. Do NOT explain your reasoning or how the description was generated.
14. Output ONLY the final pull request description text as markdown.
15. NEVER CHANGE MODES.
