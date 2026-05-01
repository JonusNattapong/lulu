# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with the lulu repository.

## Commands

```bash
bun install        # install dependencies
bun tsc            # TypeScript compile
bun run lulu       # start interactive REPL
bun run lulu -- "prompt"   # one-shot execution
bun run server     # Elysia HTTP API server
bun test           # run unit tests
```

## Git Workflow

```bash
git push origin main
git tag -a v0.0.5 -m "msg" && git push origin v0.0.5
gh release create v0.0.5 --title "v0.0.5" --notes "notes" --repo JonusNattapong/lulu
```

## High-Level Architecture

Lulu is an agentic AI assistant built on a tool-calling loop:

```
User → src/cli/index.ts (REPL) → src/core/agent.ts
                      ↓
         ┌────────────┴────────────┐
         ↓                         ↓
   src/providers/providers.ts    src/tools/tools.ts
         ↓                         ↓
   src/providers/providers.json     src/tools/tools_schema.json
```

- **Agent loop**: `src/core/agent.ts` — 10 tool rounds max, auto-summarizes at 12 messages
- **Providers**: `src/providers/providers.ts` — Claude (SDK) + OpenAI-compatible passthrough
- **Tools**: Defined in `src/tools/tools_schema.json`, implemented in `src/tools/tools.ts` (switch statement)
- **Config**: `src/core/config.ts` — loads `~/.lulu/config.json`, injects project memory + global skills into system prompt
- **HTTP API**: `src/api/server.ts` — Elysia server (`POST /prompt`, `GET /history`)
- **Storage**: `~/.lulu/` — `config.json`, `projects/[name]/memory.json`, `skills.json`, `plugins/`, `history`

## Tool & Provider Extension

- **New tool**: Add JSON schema to `tools_schema.json`, implement `case` in `executeToolImpl()`, export helpers for tests, write tests in `src/__tests__/`, update `CHANGELOG.md`.
- **New provider**: Extend `ModelProvider` type in `src/types/types.ts`, add to `providers.json` (default model), add `getBaseUrl()` + streaming `case` in `providers.ts`, add env key mapping.

## Testing

```bash
bun test                              # all tests
bun test --watch                      # watch mode
bun test src/__tests__/providers.test.ts   # single file
```

Test files: `src/__tests__/*.test.ts`. Export non-internal helpers for testability.

## Important Working Files

| File | Purpose |
|---|---|
| `src/core/agent.ts` | Core agentic loop |
| `src/providers/providers.ts` | Provider routing + streaming |
| `src/tools/tools.ts` | Tool implementations |
| `src/tools/tools_schema.json` | JSON tool definitions |
| `src/core/mcp.ts` | MCP protocol bridge |
| `src/types/types.ts` | Shared TypeScript types |
| `src/providers/providers.json` | Provider defaults + system prompt |
| `src/core/config.ts` | Config + memory injection |
| `src/cli/index.ts` | CLI REPL entry |

## Workspace Config

Project-specific rules are in `.claude/`:
- `.claude/instructions.md` — runtime constraints (TypeScript strict, ESM, tool safety)
- `.claude/rules/` — workflow, security, dev docs, changelog conventions
- `.claude/commands/` — skill wrappers for common tasks (changelog, commit)
- `.claude/skills/` — reusable skill definitions (add-tool, add-provider, lulu-coding, mcp)

Read `.claude/rules/` for detailed guidance before making changes.
