---
name: cross-modal-review
version: 1.0.0
description: Quality gate using secondary model review
triggers: ["review", "quality", "check", "second opinion"]
category: brain
quality_bar: "Review identifies issues the first pass missed"
---

# Cross-Modal Review

Second-model quality review.

## When to Trigger
- Important output needs verification
- User requests second opinion
- Before critical actions

## Steps
1. **Generate initial output** - First model response
2. **Review with second model** - Different model reviews
3. **Compare** - Find discrepancies
4. **Synthesize** - Combine best of both

## Use Cases
- Code review by two models
- Fact-checking important claims
- Security review
- Style consistency check

## Quality Bar
- Issues identified
- Confidence indicated
- Recommendations clear