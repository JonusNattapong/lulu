---
name: self-improvement
description: "Captures learnings, errors, and corrections to enable continuous improvement. Use when: (1) A command or operation fails unexpectedly, (2) User corrects Lulu ('No, that's wrong...', 'Actually...'), (3) User requests a capability that doesn't exist, (4) An external API or tool fails, (5) Claude realizes its knowledge is outdated or incorrect."
---

# Self-Improvement Skill

Log learnings and errors to markdown files for continuous improvement.

## When to Log

| Situation | Log To |
|-----------|--------|
| Command/operation fails | `.learnings/ERRORS.md` |
| User corrects you | `.learnings/LEARNINGS.md` |
| User wants missing feature | `.learnings/FEATURE_REQUESTS.md` |
| API/external tool fails | `.learnings/ERRORS.md` |
| Knowledge was outdated | `.learnings/LEARNINGS.md` |

## Setup

Create `.learnings/` directory in project root:

```bash
mkdir -p .learnings
```

## Format

### Error Entry

```markdown
## [ERR-YYYYMMDD-XXX]

**Logged**: 2026-05-01T12:00:00Z
**Status**: pending
**Area**: frontend | backend | infra | tests | docs | config

### Summary
Brief description of what failed

### Error
```
Actual error message
```

### Suggested Fix
How to resolve this
```

### Learning Entry

```markdown
## [LRN-YYYYMMDD-XXX] category

**Logged**: 2026-05-01T12:00:00Z
**Status**: pending
**Area**: ...

### Summary
One-line description

### Details
What happened, what was wrong, what's correct

### Suggested Action
Specific fix or improvement
```

### Feature Request

```markdown
## [FEAT-YYYYMMDD-XXX]

**Logged**: 2026-05-01T12:00:00Z
**Status**: pending
**Priority**: medium

### Requested Capability
What user wanted

### Complexity Estimate
simple | medium | complex
```

## Status Values

- `pending` - Not yet addressed
- `in_progress` - Being worked on
- `resolved` - Fixed
- `wont_fix` - Decided not to address
- `promoted` - Added to CLAUDE.md, AGENTS.md, or other docs

## Promotion

When learning applies broadly, promote to:
- `CLAUDE.md` - Project facts and conventions
- `AGENTS.md` - Workflows and automation rules

## Quick Actions

```bash
# Count pending items
grep -h "Status**: pending" .learnings/*.md | wc -l

# List high-priority errors
grep -B5 "Priority**: high" .learnings/*.md | grep "^## \["
```

## Best Practices

1. Log immediately - context is freshest right after issue
2. Be specific - include file paths and error messages
3. Include reproduction steps - especially for errors
4. Suggest concrete fixes - not just "investigate"
5. Review `.learnings/` before major tasks