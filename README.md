# Lulu AI

Lulu is a local-first AI coding assistant for repository work, automation, and developer operations. It provides a shared agent runtime across the CLI, local API, desktop dashboard, and Telegram.

Lulu is designed to work inside your projects, keep project-scoped context, use tools through a policy layer, and persist useful state in `~/.lulu`.

```text
  _      _    _   _      _    _
 | |    | |  | | | |    | |  | |
 | |    | |  | | | |    | |  | |
 | |____| |__| | | |____| |__| |
 |______|______| |______|______|
       v0.0.7
```

## Features

- **Skill System** (27 built-in skills) - File-based skills with SKILL.md format, resolver, and skill retrieval
- **Knowledge Brain** - Vector search, entity extraction, hybrid search (keyword + graph)
- Multi-provider model support through a provider abstraction.
- Interactive CLI and Ink-based terminal UI.
- Local API and websocket streaming for dashboard integrations.
- Desktop coworker UI built on the dashboard and Electron.
- Telegram bridge with per-chat session context.
- Central gateway runtime for routing channel messages into the shared agent loop.
- Central session store shared by CLI, API, dashboard, and Telegram.
- Layered prompt system with base, profile, project, memory, skill, and task context.
- Obsidian-compatible SOUL file system for agent behavior, safety, ops, and heartbeat notes.
- Skill retrieval that loads only relevant learned skills into each prompt.
- Project memory and reflection stored under `~/.lulu/projects/`.
- Tool registry with policy checks for filesystem, shell, tmux, web, git, task, prompt, and system tools.
- Optional tmux tools for terminal session control.
- MCP and plugin-oriented extension points.
- **Curation System** - Analyze, optimize, and merge skills automatically

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
| `LULU_SKILL_LIMIT` | Maximum retrieved skills included in the prompt | `5` |
| `LULU_HEARTBEAT_INTERVAL_MS` | Heartbeat scheduler interval | `60000` |
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
| `/skills` | Manage skills: list, search, show, create |
| `/skillify` | Capture workflow as skill |
| `/brain` | Query knowledge brain |
| `/resolver` | Manage skill resolver rules |
| `/curate` | Optimize skill library |
| `/audit` | View audit logs: query, stats, errors |

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

Create a Telegram bot with BotFather, then run the pairing wizard:

```sh
bun run telegram:setup
```

The setup command validates the bot token, waits for a Telegram message, asks you to approve the chat in the terminal, and saves the pairing to:

```text
~/.lulu/telegram.json
```

Start the Telegram bridge:

```sh
export LULU_TELEGRAM_BOT_TOKEN=123456:your-bot-token
export LULU_TELEGRAM_ALLOWED_CHAT_IDS=123456789
bun run telegram
```

If `~/.lulu/telegram.json` contains approved pairings, Lulu only responds to paired chats unless the chat is also listed in `LULU_TELEGRAM_ALLOWED_CHAT_IDS`.

Telegram uses the central session store at `~/.lulu/sessions.json`. Private chats respond directly. Group chats respond when the bot is mentioned or replied to.

Supported commands:

| Command | Description |
| --- | --- |
| `/help` | Show Telegram commands |
| `/whoami` | Show chat id, chat type, user id, and username |
| `/setup` | Show pairing and runtime status |
| `/new` or `/reset` | Start a fresh chat context |
| `/status` | Show provider, model, project, and context count |
| `/prompt` | Inspect active prompt layers |

## Core Systems

### Gateway System

Lulu routes API, dashboard, and Telegram prompts through a central gateway runtime. The gateway is responsible for:

- resolving channel-specific configuration
- routing by channel, subject, and session
- queueing turns per route key
- creating and updating sessions
- handling slash commands
- running the agent loop
- saving final messages back to the central session store

This keeps channel integrations thin. They should translate transport-specific events into gateway requests instead of owning agent execution directly.

### Identity and Binding System

Lulu stores users and channel bindings in:

```text
~/.lulu/identity.json
```

The identity system supports:

- central Lulu user ids
- channel bindings such as `telegram:<chatId>`, `api:<key>`, `desktop:<user>`, and `cli:<user>`
- roles: `admin`, `operator`, and `viewer`
- project and agent bindings per identity

Telegram setup writes both `~/.lulu/telegram.json` and the central identity store. The gateway reads identity bindings and attaches identity metadata to routed sessions.

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
4. Obsidian-compatible SOUL files from `.lulu/*.md`
5. Project memory
6. Retrieved skills relevant to the current prompt
7. Active tasks and runtime context

Inspect the prompt with `/prompt` or `GET /prompt`.

### SOUL File System

Lulu can use the project `.lulu/` directory as an Obsidian vault. Initialize the default files from any channel that supports slash commands:

```text
/soul init
```

This creates Markdown files such as:

| File | Purpose |
| --- | --- |
| `.lulu/SOUL.md` | Immutable behavior rules and truth policy |
| `.lulu/IDENTITY.md` | Agent name, role, and tone |
| `.lulu/SHIELD.md` | Safety boundaries and destructive action rules |
| `.lulu/OPS.md` | Model, cost, routing, and operational preferences |
| `.lulu/HEARTBEAT.md` | Periodic runtime rhythm and checks |
| `.lulu/CORTEX.md` | Workspace map and conventions |
| `.lulu/MEMORY.md` | Human-reviewable stable facts |
| `.lulu/AGENTS.md` | Multi-agent collaboration notes |
| `.lulu/TOOLS.md` | Tool capability rules |

Open the `.lulu/` folder in Obsidian to edit these files as a local vault.

### Skill Retrieval

Lulu's skill system combines the best of OpenClaw and GBrain with file-based skills.

**Skill Storage:**
```text
~/.lulu/skills/                    # Global skills
  resolver.md                      # Skill routing rules
  <category>/
    <skill-name>/
      SKILL.md                     # Skill definition

<project>/skills/                  # Project-specific (higher priority)
```

**Built-in Skills (27):**
| Category | Skills |
|----------|--------|
| brain | brain-ops, brain-query, meeting-notes, cross-modal-review, citation-fixer, reports |
| code | code-review, code-refactor, code-debug, test-generator, docs-generator, security-audit, api-design, database-design |
| git | git-commit, github-ops |
| web | web-search |
| tasks | daily-briefing |
| research | data-research |
| skills | skill-creator, skillify |
| setup | setup, migrate |
| operational | deploy, docker-ops, smoke-test |

**Skill Commands:**
```sh
/skills list           # List all skills
/skills search <query> # Search skills
/skills show <name>    # Show skill details
/skillify <name>        # Capture workflow as skill
/brain query <query>    # Query knowledge brain
/curate                 # Optimize skill library
```

Control the maximum number of injected skills with:

```sh
export LULU_SKILL_LIMIT=5
```

### Heartbeat and Scheduler

Lulu includes a lightweight scheduler for recurring work such as daily summaries, repo health checks, test runs, and Telegram reports.

Run due jobs once:

```sh
bun run heartbeat:once
```

Run the heartbeat loop:

```sh
bun run heartbeat
```

Custom job definitions can be placed in:

```text
~/.lulu/jobs/*.json
```

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
| `bun run telegram:setup` | Pair a Telegram chat with Lulu |
| `bun run heartbeat` | Run recurring scheduled jobs |
| `bun run heartbeat:once` | Run due scheduled jobs once |
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
| `~/.lulu/identity.json` | Users, roles, and channel bindings |
| `~/.lulu/sessions.json` | Shared sessions |
| `~/.lulu/telegram.json` | Telegram token and approved chat bindings |
| `~/.lulu/history.jsonl` | Interaction history |
| `~/.lulu/projects/<name>/memory.json` | Project memory |
| `~/.lulu/prompts/<profile>.md` | Prompt profiles |

## License

MIT
