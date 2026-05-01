# Lulu AI

Lulu is a local-first AI coding assistant for repository work, automation, and developer operations. It provides a shared agent runtime across the CLI, local API, desktop dashboard, and Telegram.

Lulu is designed to work inside your projects, keep project-scoped context, use tools through a policy layer, and persist useful state in `~/.lulu`.

```text
  _      _    _   _      _    _
 | |    | |  | | | |    | |  | |
 | |    | |  | | | |    | |  | |
 | |____| |__| | | |____| |__| |
 |______|______| |______|______|
       v0.0.5
```

## Features

- Multi-provider model support through a provider abstraction.
- Interactive CLI and Ink-based terminal UI.
- Local API and websocket streaming for dashboard integrations.
- Desktop coworker UI built on the dashboard and Electron.
- Telegram bridge with per-chat session context.
- Central session store shared by CLI, API, dashboard, and Telegram.
- Layered prompt system with base, profile, project, memory, skill, and task context.
- Project memory and reflection stored under `~/.lulu/projects/`.
- Tool registry with policy checks for filesystem, shell, tmux, web, git, task, prompt, and system tools.
- Optional tmux tools for terminal session control.
- MCP and plugin-oriented extension points.

## Requirements

- Bun 1.x recommended.
- Node.js 22+ for build and desktop tooling.
- At least one supported AI provider API key.

## Installation

### Quick Install

Linux or macOS:

```sh
curl -fsSL https://raw.githubusercontent.com/JonusNattapong/lulu/main/scripts/install.sh | bash
```

Windows PowerShell:

```powershell
irm https://raw.githubusercontent.com/JonusNattapong/lulu/main/scripts/install.ps1 | iex
```

### Manual Install

```sh
git clone https://github.com/JonusNattapong/lulu.git
cd lulu
bun install
bun run build
```

Dashboard dependencies are managed inside `dashboard/`:

```sh
cd dashboard
bun install
```

## Configuration

Create `~/.lulu/config.json`:

```json
{
  "apiKeys": {
    "anthropic": "your-anthropic-key",
    "openai": "your-openai-key"
  }
}
```

Environment variables:

| Variable | Description | Default |
| --- | --- | --- |
| `LULU_PROVIDER` | Model provider, such as `claude`, `openai`, or `deepseek` | `claude` |
| `LULU_MODEL` | Model id override | Provider default |
| `LULU_PROMPT_PROFILE` | Prompt profile loaded from `~/.lulu/prompts/<profile>.md` | `default` |
| `LULU_SESSION_MAX_MESSAGES` | Maximum messages persisted per session | `24` |
| `LULU_ALLOW_WRITE` | Enable file writes | `false` |
| `LULU_ALLOW_COMMAND` | Enable shell commands | `false` |
| `LULU_ALLOW_TMUX` | Enable built-in tmux tools without enabling all shell commands | `false` |
| `LULU_TELEGRAM_BOT_TOKEN` | Telegram Bot API token | empty |
| `LULU_TELEGRAM_ALLOWED_CHAT_IDS` | Comma-separated Telegram chat ids allowed to use the bot | empty |

## Usage

### CLI

Start an interactive session:

```sh
bun run lulu
```

Run a one-shot prompt:

```sh
bun run lulu -- "Explain the authentication flow in this project"
```

Common commands:

| Command | Description |
| --- | --- |
| `/help` | Show available commands |
| `/session` | Show active session metadata |
| `/new` or `/reset` | Start a fresh session |
| `/prompt` | Inspect active prompt layers |
| `/exit` or `/quit` | End the interactive session |

### Desktop App

Launch the desktop coworker UI:

```sh
bun run desktop
```

This starts the local API, starts the dashboard dev server, and opens an Electron window.

Build desktop artifacts:

```sh
npm run desktop:pack
```

Create an installer or package for the current OS:

```sh
npm run desktop:dist
```

See [docs/DESKTOP.md](./docs/DESKTOP.md) for desktop mode details and WSL performance notes.

### Local API

Start the API server:

```sh
bun run server
```

Useful endpoints:

| Endpoint | Description |
| --- | --- |
| `GET /status` | Runtime status |
| `POST /prompt` | Run a prompt |
| `GET /prompt` | Inspect prompt layers |
| `GET /sessions` | List stored sessions |
| `POST /sessions/reset` | Reset a stored session |

If `LULU_API_KEY` is set, API requests must include:

```text
Authorization: Bearer <key>
```

### Telegram

Create a Telegram bot with BotFather, then run:

```sh
export LULU_TELEGRAM_BOT_TOKEN=123456:your-bot-token
export LULU_TELEGRAM_ALLOWED_CHAT_IDS=123456789
bun run telegram
```

Telegram uses the central session store at `~/.lulu/sessions.json`. Private chats respond directly. Group chats respond when the bot is mentioned or replied to.

Supported commands:

| Command | Description |
| --- | --- |
| `/new` or `/reset` | Start a fresh chat context |
| `/status` | Show provider, model, project, and context count |
| `/prompt` | Inspect active prompt layers |

## Core Systems

### Session System

CLI, API, dashboard, and Telegram share a central session store:

```text
~/.lulu/sessions.json
```

Each session stores channel, subject, project, provider, model, messages, turn count, timestamps, and metadata.

### Prompt System

Lulu builds the system prompt from ordered layers:

1. Built-in base prompt or `LULU_SYSTEM_PROMPT`
2. Optional prompt profile from `~/.lulu/prompts/<profile>.md`
3. Optional project prompt from `.lulu-prompt.md` or `.lulu/prompt.md`
4. Project memory
5. Skills
6. Active tasks and runtime context

Inspect the prompt with `/prompt` or `GET /prompt`.

### tmux Tools

Set `LULU_ALLOW_TMUX=true` to enable built-in tmux operations:

- list sessions
- create sessions
- send keys
- capture panes
- kill sessions

These tools remain separate from the broader `LULU_ALLOW_COMMAND` setting.

## Safety

Lulu defaults to conservative permissions. File writes, shell commands, and tmux control are opt-in:

```sh
export LULU_ALLOW_WRITE=true
export LULU_ALLOW_COMMAND=true
export LULU_ALLOW_TMUX=true
```

Use these settings intentionally, especially when exposing Lulu through Telegram or the local API.

## Development

Common scripts:

| Script | Description |
| --- | --- |
| `bun run lulu` | Start the CLI |
| `bun run server` | Start the local API |
| `bun run telegram` | Start Telegram bridge |
| `bun run desktop` | Start desktop dev mode |
| `bun run build` | Build TypeScript |
| `bun run typecheck` | Run TypeScript without emitting files |
| `bun test` | Run tests |
| `npm run desktop:pack` | Build unpacked desktop artifact |
| `npm run desktop:dist` | Build installer/package |

Project documents:

- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)
- [docs/ROADMAP.md](./docs/ROADMAP.md)
- [docs/DESKTOP.md](./docs/DESKTOP.md)
- [CHANGELOG.md](./CHANGELOG.md)

## Data Storage

Lulu stores durable runtime state outside the repository:

| Path | Purpose |
| --- | --- |
| `~/.lulu/config.json` | Global configuration |
| `~/.lulu/sessions.json` | Shared sessions |
| `~/.lulu/history.jsonl` | Interaction history |
| `~/.lulu/projects/<name>/memory.json` | Project memory |
| `~/.lulu/prompts/<profile>.md` | Prompt profiles |

## License

MIT
