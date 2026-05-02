---
name: database-design
version: 1.0.0
description: Design database schemas and migrations
triggers: ["database", "schema", "table", "migration", "sql"]
category: code
quality_bar: "Schema is normalized, indexed, and migrations are safe"
---

# Database Design

Design and implement database schemas.

## When to Trigger
- User asks to design database
- Creating new data model
- Database migration needed

## Steps
1. **Understand requirements** - What data to store?
2. **Design schema** - Define tables and relationships
3. **Normalize** - Apply normalization rules
4. **Add indexes** - Optimize for queries
5. **Write migrations** - Create safe migration files

## Quality Bar
- Normalized schema (3NF)
- Appropriate indexes
- Foreign key constraints
- Safe migrations (up/down)
- Documentation

## Tools Required
- write_file
- database tools