---
name: docs-generator
version: 1.0.0
description: Generate documentation for code and projects
triggers: ["document", "docs", "readme", "api docs", "generate docs"]
category: code
quality_bar: "Documentation is accurate, complete, and follows project style"
---

# Documentation Generator

Generate project documentation.

## When to Trigger
- User asks for documentation
- New feature needs docs
- README needs updating

## Steps
1. **Analyze code** - Understand what to document
2. **Check existing** - See current documentation
3. **Generate content** - Write documentation
4. **Add examples** - Include code examples
5. **Format** - Follow project style

## Quality Bar
- Accurate information
- Clear examples
- Follows project conventions
- Links to related docs

## Tools Required
- read_file
- write_file
- search (for related docs)