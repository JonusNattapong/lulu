# Lulu

Lulu is a small personal AI assistant for working with local projects from the
terminal. The first release focuses on a simple Claude-backed agent that can read
files, list directories, search content, and optionally make local changes when
you explicitly enable those tools.

## Status

`v0.0.1` is an early development release. It is useful for local experiments, but
the tool surface is intentionally conservative.

## Requirements

- Node.js 22 or newer
- npm
- An Anthropic API key

## Setup

```sh
export ANTHROPIC_API_KEY="your_api_key"
npm install
npm run build
```

PowerShell:

```powershell
$env:ANTHROPIC_API_KEY="your_api_key"
npm install
npm run build
```

## Usage

Run one prompt:

```sh
npm run lulu -- "summarize this project"
```

Start an interactive session:

```sh
npm run lulu
```

Leave interactive mode with `/exit`.

## Configuration

Lulu reads configuration from environment variables:

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `ANTHROPIC_API_KEY` | Yes | - | Claude API key |
| `LULU_MODEL` | No | `claude-3-5-sonnet-20241022` | Claude model |
| `LULU_MAX_TOKENS` | No | `4096` | Maximum response tokens |
| `LULU_SYSTEM_PROMPT` | No | Built in | System prompt override |
| `LULU_ALLOW_WRITE` | No | `false` | Set to `true` to enable `write_file` |
| `LULU_ALLOW_COMMAND` | No | `false` | Set to `true` to enable `run_command` |

## Safety

By default, Lulu can inspect files but cannot write files or run shell commands.
Enable those tools only in repositories and directories you trust:

```sh
LULU_ALLOW_WRITE=true LULU_ALLOW_COMMAND=true npm run lulu
```

## Development

```sh
npm run typecheck
npm run build
npm run dev -- "what files are in src?"
```
