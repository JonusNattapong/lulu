---
name: brain-query
version: 1.0.0
description: Query the knowledge brain for context from previous sessions
triggers: ["search brain", "query brain", "what do you know", "remember about"]
category: brain
quality_bar: "Returns relevant context with citations and confidence scores"
---

# Brain Query

Search the knowledge brain for relevant context.

## When to Trigger
- User asks about previous work or conversations
- User asks about people, companies, or projects
- User asks "what do you know about X"

## Steps
1. Parse query for key entities
2. Execute brain_query with hybrid search
3. Return results with relevance scores
4. If no results, note that brain doesn't have this information

## Quality Bar
- Returns context with citations
- Shows relevance score
- Includes entity links and relationships

## Tools Required
- brain_query