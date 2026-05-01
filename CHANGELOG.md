# Changelog

## 0.0.2 (2026-05-01)

### Features

- **Streaming output**: text appears token-by-token in real-time, no waiting for full response
- **Claude config auto-detect**: reads API keys from `~/.claude/config.json` as fallback — no need to set env vars
- **REPL history**: arrow keys recall previous prompts, saved to `~/.lulu_history` across sessions

### Fixes

- `search_content` no longer requires `grep` — uses Node.js `fs` for cross-platform compatibility

## 0.0.1 (2026-05-01)

First release.

### Features

- **5 built-in tools**: `read_file`, `write_file`, `list_files`, `run_command`, `search_content`
- **10 providers**: Claude, OpenAI, DeepSeek, OpenRouter, Mistral, Google, Kilocode, Opencode, Cline, Copilot
- **REPL mode**: interactive session with context, type `/exit` to quit
- **Single prompt mode**: `lulu "summarize this project"`
- **Permission gates**: `LULU_ALLOW_WRITE` and `LULU_ALLOW_COMMAND` control destructive operations
- **Cross-platform**: Windows, macOS, Linux — pure Node.js built-ins, no external dependencies
