---
name: setup
version: 1.0.0
description: Set up new project or environment
triggers: ["setup", "init", "new project", "configure", "install"]
category: setup
quality_bar: "Project is ready to use with all dependencies installed"
---

# Project Setup

Set up new project or environment.

## When to Trigger
- User asks to set up project
- New project initialization
- Environment configuration

## Steps
1. **Check existing** - See what's already configured
2. **Install deps** - Install required packages
3. **Configure** - Set up config files
4. **Verify** - Test setup works

## Quality Bar
- Dependencies installed
- Config files created
- Project is runnable
- Documentation added

## Tools Required
- bash
- write_file
- package manager (npm/pnpm/bun)