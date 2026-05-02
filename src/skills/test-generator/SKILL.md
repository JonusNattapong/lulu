---
name: test-generator
version: 1.0.0
description: Generate unit tests for code
triggers: ["write tests", "add tests", "test", "coverage"]
category: code
quality_bar: "Tests are comprehensive, runnable, and cover edge cases"
---

# Test Generator

Generate unit tests for code.

## When to Trigger
- User asks to write tests
- Adding new feature
- Before refactoring

## Steps
1. **Analyze code** - Understand what to test
2. **Identify cases** - List happy path and edge cases
3. **Generate tests** - Write test functions
4. **Verify** - Run tests to ensure they pass

## Quality Bar
- Tests are runnable
- Cover main functionality
- Include edge cases
- Follow project conventions

## Tools Required
- read_file
- write_file
- bash (for running tests)