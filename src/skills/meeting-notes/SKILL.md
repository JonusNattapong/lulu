---
name: meeting-notes
version: 1.0.0
description: Process and summarize meeting notes
triggers: ["meeting", "notes", "transcript", "discussion"]
category: brain
quality_bar: "Meeting is summarized with action items and follow-ups"
---

# Meeting Notes

Process and summarize meeting content.

## When to Trigger
- User shares meeting notes
- Meeting transcript provided
- Discussion summary requested

## Steps
1. **Extract key points** - Identify main topics
2. **Identify participants** - Note who was involved
3. **Extract action items** - Find tasks and assignments
4. **Create summary** - Write concise summary
5. **Store in brain** - Save for future reference

## Output Format
```
## Meeting Summary: [Topic]
**Date:** [Date]
**Attendees:** [Names]

### Key Points
- Point 1
- Point 2

### Action Items
- [ ] Task 1 (@person)
- [ ] Task 2 (@person)

### Next Steps
- ...
```

## Tools Required
- brain_ingest
- brain_enrich
- write_file