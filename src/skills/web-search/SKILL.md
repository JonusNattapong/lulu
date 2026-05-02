---
name: web-search
version: 1.0.0
description: Search the web for information
triggers: ["search", "find information", "look up", "google", "what is", "who is"]
category: web
quality_bar: "Returns relevant, sourced results with URLs"
---

# Web Search

Search the web for information.

## When to Trigger
- User asks for information not in brain
- Need current data
- Research task

## Steps
1. **Brain first** - Check brain for existing knowledge
2. **Search web** - If not found, search the web
3. **Summarize** - Provide concise answer with source
4. **Optional: Ingest** - Save useful info to brain

## Quality Bar
- Source URLs included
- Information is current
- Concise summary provided

## Tools Required
- brain_query
- web search (MCP or external)