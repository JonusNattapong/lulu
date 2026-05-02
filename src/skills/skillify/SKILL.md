---
name: skillify
version: 1.0.0
description: Capture successful workflow as reusable skill
triggers: ["skillify", "capture workflow", "save as skill", "make it a skill"]
category: skills
quality_bar: "Captures exact workflow steps with triggers for future reuse"
---

# Skillify

Capture a successful workflow as a reusable skill.

## When to Trigger
- After completing a complex or reusable workflow
- User says "skillify" or "save this as a skill"
- Pattern discovered that could be automated

## Steps
1. **Identify workflow steps** from current conversation
2. **Generate skill metadata**
   - Name from workflow topic
   - Triggers from task description
   - Steps from actual actions taken
3. **Create skill via skillify tool**
4. **Confirm and document**

## Quality Bar
- Workflow captured accurately
- Triggers cover common use cases
- Steps are executable in isolation

## Tools Required
- skill_capture
- skill_create