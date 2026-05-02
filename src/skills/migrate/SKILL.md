---
name: migrate
version: 1.0.0
description: Migrate data from other systems
triggers: ["migrate", "import", "convert", "transfer data"]
category: setup
quality_bar: "Data is correctly transferred with verification"
---

# Data Migration

Migrate data from external systems.

## When to Trigger
- User wants to import data
- Switching from another tool
- Need to convert formats

## Steps
1. **Source analysis** - Understand source format
2. **Target mapping** - Map to target schema
3. **Transform** - Convert data
4. **Validate** - Verify correctness
5. **Ingest** - Import to target system

## Quality Bar
- All data transferred
- Format is correct
- No data loss
- Verification complete

## Tools Required
- read_file
- write_file
- data transformation scripts