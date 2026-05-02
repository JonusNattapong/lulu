---
name: skill-creator
version: 1.0.0
description: Create new skills from descriptions or successful workflows
triggers: ["create skill", "make a skill", "new skill", "add skill"]
category: skills
quality_bar: "Creates valid SKILL.md with frontmatter and all required fields"
---

# Skill Creator

Create new skills from descriptions or successful workflows.

## When to Trigger
- User asks to create a new skill
- Successful workflow could be reusable
- User wants to automate a repetitive task

## Steps
1. **Collect skill details**
   - Name (kebab-case)
   - Description (one-line)
   - Triggers (keywords)
   - Category
   - Steps (workflow)

2. **Create SKILL.md** with frontmatter

3. **Save to skills directory**

4. **Confirm creation**

## Quality Bar
- Valid SKILL.md with frontmatter
- All required fields present
- Triggers are specific and useful
- Steps are clear and actionable

## Tools Required
- skill_create
- write_file