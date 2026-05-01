---
name: lulu-config
description: Configure Lulu settings (~/.lulu/config.json, providers, models, permissions). Use when setting up Lulu for the first time, changing providers, or adjusting behavior.
---

# Skill: Lulu Configuration

Manage Lulu configuration files and settings.

## Config File

Location: `~/.lulu/config.json`

```json
{
  "global": {
    "theme": "dark",
    "default_model": "claude-3-5-sonnet-20240620",
    "max_history_rounds": 50,
    "allow_analytics": false
  },
  "providers": {
    "claude": { "priority": 1 },
    "openai": { "priority": 2 }
  }
}
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `LULU_PROVIDER` | `claude` | Provider key (claude, openai, deepseek, etc.) |
| `LULU_MODEL` | provider default | Model override |
| `LULU_MAX_TOKENS` | `4096` | Max response tokens |
| `LULU_SYSTEM_PROMPT` | built-in | System prompt override |
| `LULU_ALLOW_WRITE` | `false` | Enable `write_file` tool |
| `LULU_ALLOW_COMMAND` | `false` | Enable `run_command` tool |

## API Keys

Keys are read from two sources (env takes priority):

1. Environment variables (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, etc.)
2. `~/.claude/config.json` → `apiKeys` object (fallback)

Provider name mapping from Claude config to lulu:
- `anthropic` → `ANTHROPIC_API_KEY`
- `openai` → `OPENAI_API_KEY`
- `deepseek` → `DEEPSEEK_API_KEY`
- `openrouter` → `OPENROUTER_API_KEY`
- `mistral` → `MISTRAL_API_KEY`
- etc.

## Provider List

| Key | Model |
|-----|-------|
| `claude` | `claude-3-5-sonnet-20241022` |
| `openai` | `gpt-4o` |
| `deepseek` | `deepseek-chat` |
| `openrouter` | `anthropic/claude-3.5-sonnet` |
| `mistral` | `mistral-large-latest` |
| `google` | `gemini-1.5-pro` |
| `kilocode` | `kilocode-1` |
| `opencode` | `opencode-1` |
| `cline` | `cline-1` |
| `copilot` | `copilot-1` |
