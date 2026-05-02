# Lulu AI

Lulu is a local-first AI coding assistant for repository work, automation, and developer operations. It provides a shared agent runtime across the CLI, local API, web dashboard, desktop app, and Telegram.

Lulu is designed to work inside your projects, keep project-scoped context, use tools through a policy layer, and persist useful state in `~/.lulu`.

```
  _      _    _   _      _    _
 | |    | |  | | | |    | |  | |
 | |    | |  | | | |    | |  | |
 | |____| |__| | | |____| |__| |
 |______|______| |______|______|
       v0.0.7
```

## Features

- **Personal AI Agent** - Persistent daemon with always-on context, learns user preferences, proposes skills, and acts proactively
- **Global Memory** - Cross-session persistent facts, todos, and research queue that persists across all projects
- **Task Queue** - Background automation queue with scheduling, auto-executes due tasks every 30 seconds
- **Autonomous Research** - Background research without user prompt, extracts findings, sources, and facts
- **Proactive Suggestions** - Detects patterns and suggests proactively via notifications or session-start surfacing
- **Skill Proposal Engine** - Auto-detects workflow patterns, proposes skills for user review, creates SKILL.md on approval
- **Desktop App** - Electron app with system tray, global shortcuts, daemon management, and auto-start on boot
- **Skill System** (32 built-in skills) - File-based skills with SKILL.md format, resolver, and skill retrieval
- **Knowledge Brain** - Vector search, entity extraction, hybrid search (keyword + graph)
- **Sub-Agent Runtime** - Spawn isolated child sessions for parallel research, code edits, and tests
- **Trajectory Export** - Export sessions as JSON/JSONL for debugging, evaluation, and fine-tuning
- **Execution Backends** - Unified execution for local shell, tmux, Docker, and SSH
- **Autonomous Multi-Agent Coordination** - Task orchestration with dependency graph resolution
- **Always-On Agent Service** - Background heartbeat loop with scheduled jobs and Telegram notifications
- **Notification Manager** - Multi-channel dispatch (Telegram, webhook)
- **LSP Neovim Integration** - Language Server Protocol for code actions, explain, fix, refactor
- **Curation System** - Analyze, optimize, and merge skills automatically
- Multi-provider model support through a provider abstraction
- Interactive CLI and Ink-based terminal UI
- Local API and WebSocket streaming for dashboard integrations
- Desktop coworker UI built on dashboard and Electron
- Telegram bridge with per-chat session context
- Central gateway runtime for routing channel messages into the shared agent loop
- Central session store shared by CLI, API, dashboard, and Telegram
- Layered prompt system with base, profile, project, memory, skill, and task context
- Obsidian-compatible SOUL file system for agent behavior, safety, ops, and heartbeat notes
- Skill retrieval that loads only relevant learned skills into each prompt
- Project memory and reflection stored under `~/.lulu/projects/`
- Tool registry with policy checks for filesystem, shell, tmux, web, git, task, prompt, and system tools
- Optional tmux tools for terminal session control
- MCP and plugin-oriented extension points

## Requirements

- Bun 1.x recommended
- Node.js 22+ for build and desktop tooling
- At least one supported AI provider API key

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
| `LULU_PROVIDER` | Model provider (`claude`, `openai`, `deepseek`) | `claude` |
| `LULU_MODEL` | Model id override | Provider default |
| `LULU_PROMPT_PROFILE` | Prompt profile from `~/.lulu/prompts/<profile>.md` | `default` |
| `LULU_SESSION_MAX_MESSAGES` | Maximum messages persisted per session | `24` |
| `LULU_SKILL_LIMIT` | Maximum retrieved skills included in the prompt | `5` |
| `LULU_HEARTBEAT_INTERVAL_MS` | Heartbeat scheduler interval | `60000` |
| `LULU_ALLOW_WRITE` | Enable file writes | `false` |
| `LULU_ALLOW_COMMAND` | Enable shell commands | `false` |
| `LULU_ALLOW_TMUX` | Enable built-in tmux tools | `false` |
| `LULU_TELEGRAM_BOT_TOKEN` | Telegram Bot API token | empty |
| `LULU_TELEGRAM_ALLOWED_CHAT_IDS` | Comma-separated allowed Telegram chat ids | empty |

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
| `/agents` | Manage sub-agents: list, status, abort |
| `/trajectory` | Export, list, load session trajectories |
| `/execution` | Run in shell/tmux/Docker/SSH backends |
| `/coordinator` | Orchestrate multi-agent tasks |
| `/daemon [start\|stop\|status]` | Personal agent daemon control |
| `/proposals [list\|approve\|reject]` | Review skill proposals |
| `/preferences` | Show learned user preferences |
| `/suggestions [list\|dismiss]` | Manage proactive suggestions |
| `/learn <key>=<value>` | Explicitly teach a preference |
| `/memory [list\|add\|search\|stats]` | Global cross-session memory |
| `/queue [list\|add\|run\|cancel]` | Background task queue |
| `/research <query>` | Queue autonomous research topic |

### Desktop App

Launch the desktop coworker UI with system tray:

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

### Personal Agent Daemon

Lulu can run as a persistent personal AI agent daemon — maintaining context across sessions, learning preferences, and acting proactively.

```sh
# Start the daemon
bun run daemon:start

# Check status
bun run daemon:status

# Stop
bun run daemon:stop
```

Inside a session, daemon commands are also available:

| Command | Description |
| --- | --- |
| `/daemon start` | Start the daemon |
| `/daemon stop` | Stop the daemon |
| `/daemon status` | Show daemon status |
| `/proposals list` | Show pending skill proposals |
| `/proposals approve <id>` | Approve and create skill |
| `/preferences` | Show learned preferences |
| `/suggestions list` | Show proactive suggestions |
| `/suggestions dismiss <id>` | Dismiss a suggestion |
| `/learn key=value` | Teach a preference |
| `/memory list` | List global memory facts |
| `/memory add key=value` | Add a fact |
| `/queue list` | Show background task queue |
| `/research "query"` | Queue research topic |

Auto-start on boot:

- **Windows:** `powershell -File scripts/install-daemon.ps1`
- **Linux/macOS:** `bash scripts/install-daemon.sh`

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
| `GET/POST /trajectories` | Trajectory export/import |
| `GET/POST /coordinator/tasks/*` | Task orchestration |
| `GET/POST /always-on/*` | Always-on service |
| `GET/POST /daemon/*` | Personal agent daemon control |
| `GET/POST /proposals` | Skill proposal management |
| `GET/DELETE /suggestions/*` | Proactive suggestions |
| `GET /learn/stats` | Learning stats and preferences |
| `GET/POST/DELETE /memory/*` | Global memory (facts, todos) |
| `GET/POST /queue/tasks/*` | Background task queue |
| `GET/POST /research/*` | Autonomous research topics |

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

This keeps channel integrations thin. They translate transport-specific events into gateway requests instead of owning agent execution directly.

### Identity and Binding System

Lulu stores users and channel bindings in:

```text
~/.lulu/identity.json
```

The identity system supports:

- central Lulu user ids
- channel bindings: `telegram:<chatId>`, `api:<key>`, `desktop:<user>`, `cli:<user>`
- roles: `admin`, `operator`, `viewer`
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

```
/soul init
```

This creates Markdown files:

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

### Sub-Agent Runtime

Spawn isolated child sessions for parallel work:

```
/agents spawn "research context" --project=myproj
/agents list
/agents status <id>
/agents abort <id>
```

Tools: `spawn_agent`, `wait_for_agents`, `agent_status`, `list_agents`, `abort_agent`.

### Trajectory Export

Export sessions as JSON/JSONL for debugging, evaluation, and fine-tuning:

```
/trajectory export <sessionId> --format=json
/trajectory list
/trajectory load <trajectoryId>
```

### Execution Backends

Run commands in different execution environments:

```
/execution run "docker build" --backend=docker
/execution backends
/execution status <id>
/execution list
/execution abort <id>
```

Supported backends: `shell`, `tmux`, `docker`, `ssh`.

### Coordinator (Multi-Agent Orchestration)

Orchestrate complex tasks across multiple agents:

```
/coordinator orchestrate "build a REST API" --agents=3
/coordinator tasks
/coordinator status <taskId>
```

### Skill Retrieval

Lulu's skill system combines file-based skills with trigger-based resolver and smart retrieval.

**Skill Storage:**
```
~/.lulu/skills/                    # Global skills
  resolver.md                      # Skill routing rules
  <category>/
    <skill-name>/
      SKILL.md                     # Skill definition

<project>/skills/                  # Project-specific (higher priority)
```

**Built-in Skills (32):**

| Category | Skills |
|----------|--------|
| brain | brain-ops, brain-query, meeting-notes, cross-modal-review, citation-fixer, reports, daily-task-prep |
| code | code-review, code-refactor, code-debug, test-generator, docs-generator, security-audit, api-design, database-design, cross-modal |
| git | git-commit, github |
| web | web-search |
| tasks | daily-briefing |
| research | data-research |
| skills | skill-creator, skillify |
| setup | setup, migrate |
| operational | deploy, docker, docker-ops, smoke-test |

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

```
~/.lulu/jobs/*.json
```

### Always-On Agent Service

Background heartbeat with scheduled jobs and notifications:

```sh
/always-on status           # Check always-on service status
/always-on configure        # Configure always-on settings
/send-notification "message" # Send notification via Telegram
/notification history       # View notification history
```

### LSP Neovim Integration

Language Server Protocol for Neovim clients. Run the LSP server:

```sh
bun src/langserver/main.ts
```

Keybindings:

| Key | Action |
|-----|--------|
| `gA` | Ask Lulu |
| `gE` | Explain |
| `gF` | Fix |
| `gR` | Refactor |
| `K` | Hover docs |
| `<leader>ca` | Code action |

See [docs/LSP-NEOVIM.md](./docs/LSP-NEOVIM.md) for full setup instructions.

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
| `bun run daemon` | Start the personal agent daemon |
| `bun run daemon:start` | Start daemon |
| `bun run daemon:stop` | Stop daemon |
| `bun run daemon:status` | Check daemon status |
| `bun run desktop` | Start desktop dev mode |
| `bun run build` | Build TypeScript |
| `bun run typecheck` | Run TypeScript without emitting files |
| `bun test` | Run tests |
| `npm run desktop:build` | Build TypeScript + dashboard |
| `npm run desktop:icons` | Generate app icon |
| `npm run desktop:pack` | Build unpacked desktop artifact |
| `npm run desktop:dist` | Build installer/package |

Project documents:

- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)
- [docs/ROADMAP.md](./docs/ROADMAP.md)
- [docs/DESKTOP.md](./docs/DESKTOP.md)
- [docs/LSP-NEOVIM.md](./docs/LSP-NEOVIM.md)
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
| `~/.lulu/daemon.pid` | Daemon process ID |
| `~/.lulu/global-memory.json` | Cross-session facts, todos, research queue |
| `~/.lulu/task-queue.json` | Background automation queue |
| `~/.lulu/skill-proposals.json` | Pending skill proposals |
| `~/.lulu/proactive-suggestions.json` | Active proactive suggestions |
| `~/.lulu/user-profile.json` | User preferences, learnings, proposals |
| `~/.lulu/projects/<name>/memory.json` | Project memory |
| `~/.lulu/prompts/<profile>.md` | Prompt profiles |
| `~/.lulu/skills/` | Skill library |
| `~/.lulu/skills/auto-generated/` | Auto-created skills from proposals |
| `~/.lulu/brain/` | Knowledge brain |
| `~/.lulu/jobs/` | Scheduled job definitions |
| `~/.lulu/trajectories/` | Exported session trajectories |
| `~/.lulu/alwayson.json` | Always-on service configuration |

## License

MIT