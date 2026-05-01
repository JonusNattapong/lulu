---
description: Performs a security and quality review of the codebase.
---

# Task
1. Scan the current project for hardcoded API keys, secrets, or sensitive environment variables.
2. Check for the use of `any` in TypeScript files and suggest proper interfaces.
3. Verify that all imports in `.ts` files include the `.js` extension (ESM compliance).
4. Look for potential performance bottlenecks in the agent loop (`src/agent/agent.ts`).
5. Ensure that tool execution functions in `src/agent/tools.ts` have proper error handling.
