---
name: brain-ops
version: 1.0.0
description: Always-on brain operations - lookup brain before external APIs
triggers: ["brain", "knowledge", "remember", "previous", "past"]
category: brain
quality_bar: "Brain is consulted first, external APIs only when brain is empty"
---

# Brain Ops

Always-on skill that ensures brain-first lookup before external APIs.

## When to Trigger
This skill is always active and runs before any external API calls.

## Steps
1. **Check brain first** - Query the knowledge graph for relevant context
2. **If brain has results** - Use brain results as primary context
3. **If brain is empty** - Proceed with external API calls
4. **After API call** - Optionally write results back to brain

## Quality Bar
- Brain is always consulted first
- External APIs supplement, not replace, brain knowledge
- Results are written back to brain when valuable

## Dependencies
- brain-query tool

## Tools Required
- brain_query
- brain_ingest