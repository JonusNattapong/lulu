# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Lulu** is a small personal CLI AI assistant that reads files, searches content, and optionally makes changes in local projects. It runs single prompts or interactive sessions from the terminal.

## Build & Run

```sh
npm install
npm run build           # Compile TypeScript
npm run lulu -- "..."    # Run one prompt
npm run lulu             # Interactive session (type /exit to quit)
npm run dev -- "..."     # Dev mode with ts-node (no build step)
npm run typecheck        # TypeScript type checking only
```

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | For claude | Claude API key |
| `OPENAI_API_KEY` | For openai | OpenAI API key |
| `DEEPSEEK_API_KEY` | For deepseek | DeepSeek API key |
| `OPENROUTER_API_KEY` | For openrouter | OpenRouter API key |
| `MISTRAL_API_KEY` | For mistral | Mistral API key |
| `LULU_PROVIDER` | No | Provider name (default: claude) |
| `LULU_MODEL` | No | Model override |
| `LULU_MAX_TOKENS` | No | Max response tokens (default: 4096) |
| `LULU_ALLOW_WRITE` | No | Set `true` to enable `write_file` tool |
| `LULU_ALLOW_COMMAND` | No | Set `true` to enable `run_command` tool |

Lulu auto-detects available API keys and falls back to the first provider with a key if the default isn't configured.

## Architecture

**Entry point**: `src/index.ts` — handles CLI args and interactive REPL loop.

**Agent loop** (`src/agent/agent.ts`): runs up to 10 tool-use rounds. Sends messages → provider → executes tool calls → appends results → repeats.

**Tool system** (`src/agent/tools.ts`): `BUILTIN_TOOLS` defines 5 tools (`read_file`, `write_file`, `list_files`, `run_command`, `search_content`). `executeTool()` runs them with permission gates via `LULU_ALLOW_WRITE` / `LULU_ALLOW_COMMAND`.

**Provider abstraction** (`src/agent/providers.ts`): `sendToProvider()` routes to Claude (official SDK) or OpenAI-compatible APIs (OpenRouter, DeepSeek, Mistral, etc.) via `/chat/completions`. Message format is normalized to Anthropic's `MessageParam` type.

**Config** (`src/config.ts`): `loadConfig()` reads env vars and builds an `AgentConfig` object with provider, model, API key, and system prompt.

**Max 10 tool rounds** enforced in `agent.ts`. Beyond that, the loop stops and returns "(max tool rounds reached)".
