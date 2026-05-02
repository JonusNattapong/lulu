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

## Steps
1. Identify the Docker operation needed
2. Execute with appropriate flags
3. Verify the result

## Common Operations
- Build images: `docker build`
- Run containers: `docker run`
- Docker compose up/down
- Inspect logs: `docker logs`
- Manage volumes: `docker volume`

## Safety Rules
- Never run privileged containers by default
- Clean up unused images regularly
- Use specific tags, not 'latest'

## Tools Required
- bash (docker CLI)
- read/write files