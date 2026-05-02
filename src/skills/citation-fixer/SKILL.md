---
name: citation-fixer
version: 1.0.0
description: Fix missing or malformed citations in brain pages
triggers: ["citation", "cite", "reference", "source"]
category: brain
quality_bar: "All claims have valid citations"
---

# Citation Fixer

Fix and verify citations in content.

## When to Trigger
- User asks to fix citations
- New content needs citations
- Citation audit requested

## Steps
1. **Scan content** - Find uncited claims
2. **Identify sources** - Find source URLs
3. **Add citations** - Insert proper references
4. **Validate** - Ensure citation format is correct

## Citation Format
```
[Source: Author/Title](URL)
```

## Quality Bar
- All claims cited
- URLs valid
- Format consistent
- Broken links fixed