---
description: Generate pull request description
agent: code
output: markdown
---

## Steps

1. Use the Question tool to ask the user for:
   - **Current branch:** The branch containing the changes (defaults to current branch if not specified)
   - **Target branch:** The branch to merge into (e.g., main, master, develop)
2. Determine the target merge branch and the current branch based on user input.
3. Find the merge base using `git merge-base <current-branch> <target-branch>`.
4. Retrieve commits with full message bodies using `git log <merge-base>..<current-branch> --format=full`. This ensures you get the complete commit messages including the body text, not just the short subject line.
5. Retrieve the full diff using `git diff <merge-base>..<current-branch>`.
6. Analyze extended commit messages (including body text) to understand intent, sequencing, and narrative.
7. Analyze diffs to identify all changes including:
   - New features and enhancements
   - Architectural changes
   - Refactoring efforts
   - Performance improvements
   - Bug fixes
   - Test coverage additions
   - Documentation updates
   - Breaking changes
8. Synthesize the branch into a single cohesive story.
9. Produce a PR description following this format (only include sections that apply):

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

10. For file references in bullet points, use markdown link format: [`filenameOrFunction()`](relative/path/file.ext)
11. Do NOT include raw diffs, commit hashes, or speculative commentary.
12. Do NOT explain your reasoning or how the description was generated.
13. Output ONLY the final pull request description text as markdown.
14. NEVER CHANGE MODES.
