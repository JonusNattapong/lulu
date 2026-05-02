---
name: code-refactor
version: 1.0.0
description: Refactor code to improve readability and maintainability
triggers: ["refactor", "clean up code", "improve code", "restructure"]
category: code
quality_bar: "Code is cleaner, more readable, and maintains same functionality"
---

# Code Refactor

Refactor code while maintaining functionality.

## When to Trigger
- User asks to refactor code
- Code review suggests improvements
- Before adding new features

## Steps
1. **Understand code** - Read and analyze current implementation
2. **Identify issues** - Find code smells, duplication, complexity
3. **Plan refactor** - Outline changes needed
4. **Execute refactor** - Make changes incrementally
5. **Verify** - Ensure tests pass

## Quality Bar
- Functionality unchanged
- Code is cleaner and more readable
- No introduced bugs
- Tests still pass

## Tools Required
- read_file
- write_file
- bash (for running tests)