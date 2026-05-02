---
name: smoke-test
version: 1.0.0
description: Run quick health checks on the system
triggers: ["health", "check", "test", "status", "diagnose"]
category: operational
quality_bar: "Health checks pass or identify issues clearly"
---

# Smoke Test

Run system health checks.

## When to Trigger
- User asks for system status
- After deployment
- Before critical operations

## Steps
1. Check dependencies are available
2. Validate configuration files
3. Test connectivity to external services
4. Check system resources (disk/memory)
5. Verify required services are running

## Health Checks
1. Dependencies - Are required tools available?
2. Configuration - Is config valid?
3. Connectivity - Can we reach external services?
4. Resources - Enough disk/memory?
5. Services - Are required services running?

## Output Format
```
## Health Check Results

✅ Dependencies: All available
✅ Configuration: Valid
⚠️ Database: Connected (slow response)
✅ External APIs: Reachable

Status: DEGRADED
```

## Tools Required
- bash
- health check scripts