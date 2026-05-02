---
name: github-ops
version: 1.0.0
description: GitHub operations - PRs, issues, releases
triggers: ["github", "pull request", "pr", "issue", "release", "branch"]
category: git
quality_bar: "GitHub operations are executed correctly with proper context"
---

# GitHub Operations

Perform GitHub operations.

## When to Trigger
- User asks about GitHub
- Managing PRs or issues
- Creating releases

## Steps
1. **Understand intent** - What operation needed?
2. **Execute** - Run appropriate GitHub action
3. **Report** - Summarize results

## Common Operations
- Create PR with description
- Review PR and comment
- Close/manage issues
- Create releases
- Check CI status

## Tools Required
- bash (gh CLI)
- read/write files