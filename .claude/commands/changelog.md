---
description: Generates a new entry for the CHANGELOG.md based on recent commits.
---

# Task
1. Run `git log -n 10 --oneline` to see recent changes.
2. Identify the current version from `package.json`.
3. Draft a new entry for `CHANGELOG.md` following the conventions in `.claude/rules/changelog.md`.
4. If there are unreleased changes, place them under a `## [Unreleased]` section at the top.
5. Present the draft to the user for approval.
6. Once approved, append/prepend the draft to `CHANGELOG.md`.
