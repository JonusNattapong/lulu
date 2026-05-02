---
name: code-review
version: 1.0.0
description: Perform code review with best practices and security focus
triggers: ["review code", "code review", "check code", "review pr"]
category: code
quality_bar: "Provides actionable feedback with specific line references"
---

# Code Review

Perform thorough code reviews.

## When to Trigger
- User asks to review code
- User asks to review a PR
- During development for quality checks

## Steps
1. **Read the code** - Understand the context
2. **Check functionality** - Does it do what it claims?
3. **Review style** - Follows project conventions?
4. **Security check** - Any vulnerabilities?
5. **Performance** - Any bottlenecks?
6. **Tests** - Adequate test coverage?
7. **Provide feedback** - Specific, actionable

## Quality Bar
- Specific line references
- Actionable suggestions
- Security awareness
- constructive tone

## Tools Required
- read_file
- search