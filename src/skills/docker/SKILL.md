---
name: docker-ops
version: 1.0.0
description: Docker operations - containers, images, compose
triggers: ["docker", "container", "image", "compose", "dockerfile"]
category: operational
quality_bar: "Docker operations are executed safely with proper context"
---

# Docker Operations

Manage Docker containers and images.

## When to Trigger
- User asks about Docker
- Building or running containers
- Docker compose operations

## Common Operations
- Build images
- Run containers
- Docker compose up/down
- Inspect logs
- Manage volumes

## Safety Rules
- Never run privileged containers by default
- Clean up unused images regularly
- Use specific tags, not 'latest'

## Tools Required
- bash (docker CLI)
- read/write files