---
name: deploy
version: 1.0.0
description: Deploy applications to various platforms
triggers: ["deploy", "release", "publish", "production", "host"]
category: operational
quality_bar: "Application is successfully deployed and accessible"
---

# Deployment

Deploy application to target platform.

## When to Trigger
- User asks to deploy
- Ready for production release
- Need to update live system

## Steps
1. Check prerequisites - tests pass, docs updated
2. Build - Create production build
3. Configure - Set environment variables
4. Deploy - Deploy to target platform
5. Verify - Confirm deployment works

## Pre-deployment Checklist
1. Run tests and ensure passing
2. Create production build
3. Set environment configuration
4. Create backup of current deployment
5. Prepare rollback plan

## Post-deployment Checklist
1. Run health check
2. Verify features working
3. Check logs for new errors

## Tools Required
- bash
- write_file
- deployment tools (docker, etc.)