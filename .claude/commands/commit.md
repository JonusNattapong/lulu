---
description: Automatically generates a semantic commit message and commits changes.
---

# Task
1. Run `git status` to identify changed files.
2. Run `git diff --cached` (or `git diff` if not staged) to analyze changes.
3. Generate a commit message following the [Conventional Commits](https://www.conventionalcommits.org/) specification (e.g., `feat:`, `fix:`, `refactor:`).
4. Stage the files if they are not already staged.
5. Ask for user confirmation before executing `git commit -m "message"`.
