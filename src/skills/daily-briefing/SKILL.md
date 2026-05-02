---
name: daily-briefing
version: 1.0.0
description: Generate daily briefing with meeting context, tasks, and priorities
triggers: ["daily briefing", "morning brief", "daily summary", "today's plan"]
category: tasks
quality_bar: "Briefing covers tasks, calendar, and priority actions for the day"
---

# Daily Briefing

Generate a comprehensive daily briefing.

## When to Trigger
- User asks for daily briefing
- Morning interaction
- Start of work session

## Steps
1. **Review tasks** - Check active and pending tasks
2. **Check calendar** - If available, review today's meetings
3. **Recent context** - Check brain for recent conversations
4. **Generate briefing** - Compile into structured format

## Output Format
```
## Good morning! Here's your briefing:

### Priority Tasks
- [ ] Task 1
- [ ] Task 2

### Meetings
- 10:00 AM - Meeting description

### Quick Notes
- Recent context from yesterday
```

## Tools Required
- task_list
- brain_query
- calendar (if available)