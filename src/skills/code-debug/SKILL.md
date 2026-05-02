---
name: code-debug
version: 1.0.0
description: Debug code issues and fix bugs
triggers: ["debug", "fix bug", "error", "not working", "crash", "issue"]
category: code
quality_bar: "Identifies root cause and provides working fix"
---

# Code Debug

Debug and fix code issues.

## When to Trigger
- User reports a bug
- Code is throwing errors
- Something is not working as expected

## Steps
1. **Reproduce** - Understand the issue
2. **Locate** - Find the source of the problem
3. **Analyze** - Understand why it's failing
4. **Fix** - Implement solution
5. **Verify** - Confirm fix works

## Quality Bar
- Root cause identified
- Fix addresses the actual problem
- No new issues introduced
- Explanation provided

## Tools Required
- read_file
- bash (for running and testing)
- search (to find related code)