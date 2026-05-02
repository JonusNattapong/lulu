---
name: git-commit
version: 1.0.0
description: Create git commits with proper conventions
triggers: ["commit", "git commit", "commit changes", "save changes"]
category: git
quality_bar: "Commits follow conventional commits format with descriptive messages"
---

# Git Commit

Create well-formed git commits.

## When to Trigger
- User asks to commit changes
- After significant work is done
- Before pushing to remote

## Steps
1. **Check git status** - See what files changed
2. **Review changes** - Understand what was modified
3. **Write commit message** following conventional commits:
   - feat: new feature
   - fix: bug fix
   - docs: documentation
   - style: formatting
   - refactor: code restructure
   - test: adding tests
   - chore: maintenance
4. **Stage relevant files**
5. **Create commit**

## Quality Bar
- Conventional commit format
- Descriptive body explaining "why"
- Reference issues if applicable

## Tools Required
- bash (git commands)