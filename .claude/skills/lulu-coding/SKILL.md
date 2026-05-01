---
name: lulu-coding
description: Coding guidelines for Lulu development. Use when writing, reviewing, or refactoring Lulu source code to match project conventions.
---

# Lulu Coding Guidelines

## Project Conventions

### File Structure
```
src/
├── index.ts          # CLI entry, REPL, argument parsing
├── config.ts         # Config loading, provider mapping, Claude config fallback
├── types.ts          # Type definitions (ToolDef, ToolCall, etc.)
├── agent/
│   ├── agent.ts      # Agent loop, tool orchestration
│   ├── providers.ts  # Provider clients (Claude SDK + OpenAI-compatible)
│   └── tools.ts      # Built-in tool implementations
```

### TypeScript
- **Strict types** — no `any` unless interacting with untyped APIs
- **ESM** — `.js` extensions in imports
- **Interfaces over types** for public APIs
- **Functional approach** — pure functions where possible

### Provider System
- All data JSON-ified, normalized to Anthropic message format internally
- Claude uses `@anthropic-ai/sdk` directly
- Other providers use OpenAI-compatible API via `fetch`
- Streaming: text printed via `process.stdout.write` in real-time

### Naming
- `snake_case` for tool names (matching Anthropic convention)
- `PascalCase` for types/interfaces
- `camelCase` for functions/variables
- `LULU_*` prefix for all env vars

### Error Handling
- Tool errors: return `ToolResult` with `is_error: true`
- Provider errors: throw with descriptive message
- Config errors: throw early in `loadConfig()`

## Adding Features

### New Provider
1. Add to `ModelProvider` type in `src/types.ts`
2. Add to `getBaseUrl()` in `src/agent/providers.ts`
3. Route in `sendToProvider()` / `sendToProviderStream()`
4. Add env var mapping in `src/config.ts`
5. Add to `CLAUDE_CONFIG_MAP` if name differs from env var

### New Tool
1. Add `ToolDef` to `BUILTIN_TOOLS`
2. Add `case` to `executeToolImpl`
3. Add permission env var if destructive
