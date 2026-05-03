# Changelog

All notable changes to the Lulu project will be documented in this file.

## [Unreleased]

### Added

- **Layered Memory (Compaction)** - Autonomous memory compaction system that summarizes raw session memories into stable facts in `soul/MEMORY.md` to optimize context window usage.
- **Cybersecurity Hardening** - Multi-layered security protocols:
  - API server restricted to `localhost` with mandatory Token-based authentication (`LULU_API_TOKEN`).
  - Enhanced `SecurityManager` with advanced regex for detecting obfuscated commands (Python, Perl, Base64) and prompt injection heuristics.
  - Mandatory policy and approval checks integrated for both built-in tools and external plugins.
  - Automated PII/Secret redaction for learned preferences and memory syncing.
- **Infrastructure Observability** - Integrated session-end metrics (turns, tool calls, errors, costs) into the self-reflection loop for better diagnostic tracking.
- **Reliability Testing** - Comprehensive unit test suite for security protocols and centralized path management using Bun's test runner.

### Changed

- **Centralized Path Management** - Standardized filesystem access via `src/core/paths.ts`, eliminating hardcoded paths and ensuring cross-platform configuration stability.
- **Active SOUL Integration** - Agent now dynamically injects behavior-defining Markdown files (`IDENTITY.md`, `SHIELD.md`, etc.) into every session, making the "Soul" of the agent truly operational.
- **Memory Growth Monitoring** - `AlwaysOnService` now monitors actual SQLite database file size for more accurate memory growth notifications.

## [v0.0.8] - 2026-05-02

### Added

- **Personal AI Agent** - Persistent daemon with always-on context, learning, proactive behavior, and skill proposals.
- **Personal Agent Daemon** - `bun run daemon:start`, `/daemon`, daemon PID management. Commands: `/daemon`, `/proposals`, `/preferences`, `/suggestions`, `/learn`, `/memory`, `/queue`, `/research`.
- **User Profile System** - Persistent user preferences, learnings, skill proposals in `~/.lulu/user-profile.json`.
- **Skill Proposal Engine** - Auto-detects 5+ tool usage, proposes skills for review, creates `SKILL.md` on approval.
- **Proactive Suggestion Engine** - Pattern detection, session-start surfacing, Telegram notifications. `/suggestions list|dismiss`.
- **Global Memory** - Cross-session facts, todos, research queue in `~/.lulu/global-memory.json`. `/memory list|add|search`.
- **Background Task Queue** - Automation scheduler (every 30s), auto-executes due tasks. `/queue list|add|run|cancel`.
- **Autonomous Research Mode** - Background research, extracts summary/findings/sources/facts. `/research <query> [--deep|--shallow]`.
- **Preference Learning** - Tracks preferences from corrections, accepted/rejected suggestions. `/learn key=value`, `/preferences`.
- **Electron Desktop App** - System tray, global shortcuts (Ctrl+Shift+L, Ctrl+Shift+K), daemon management. `bun run desktop`.
- **Auto-Start on Boot** - Windows Task Scheduler, macOS LaunchAgent, Linux systemd. `scripts/install-daemon.sh/ps1`.
- **Personal Agent Dashboard** - Real-time daemon status, proposals, suggestions, preferences in "Personal Agent" tab.
- **Daemons Tools** - 8 daemon tools: `daemon_status`, `daemon_learn_preference`, `daemon_propose_skill`, `daemon_remember`, `daemon_recall`, `daemon_suggest`, `daemon_list_suggestions`, `daemon_dismiss_suggestion`.
- **GitHub Pages Docs** - Docs site deployed at `https://jonusnattapong.github.io/lulu/` with sidebar navigation and dark theme.
- **API Endpoints** - New endpoints: `/daemon/*`, `/proposals`, `/suggestions/*`, `/learn/*`, `/memory/*`, `/queue/*`, `/research/*`.

## [v0.0.7] - 2026-05-01

### Added

- **Edit Command:** Added `/edit` command for batch file editing with AI-suggested changes.
- **Message History Navigation:** Reverse chronological message history with keyboard navigation in the terminal UI.
- **Status Bar:** Real-time status bar showing model, provider, and session info in the terminal UI.
- **Telegram Pairing Wizard:** Added `telegram:setup` to validate a bot token, approve a Telegram chat from the host terminal, and persist approved bindings in `~/.lulu/telegram.json`.
- **Gateway Runtime:** Added a central gateway for API, dashboard, and Telegram routing, including per-route queues, session resolution, command handling, agent execution, and message persistence.
- **Identity and Binding System:** Added central users, roles, channel bindings, project bindings, and agent bindings in `~/.lulu/identity.json`, with Telegram setup writing identity bindings during pairing.
- **SOUL File System:** Added Markdown-based `.lulu/*.md` behavior files and `/soul init`. Obsidian is optional; Lulu reads these files directly from disk.
- **Skill Retrieval:** Prompt construction now selects relevant `SKILL.md` files from project/global skill folders instead of injecting the entire skill store.
- **Heartbeat Runner:** Added `heartbeat` and `heartbeat:once` scripts for recurring scheduler jobs.

### Changed

- Improved README with a more professional technical overview.

## [v0.0.6] - 2026-05-02

### Added

- **The Strong Brain (Local Intelligence):** Integrated Transformers.js for local model inference and SQLite-vec for semantic search — fully offline AI capabilities.
- **Markdown & Syntax Highlighting:** Enhanced terminal rendering with markdown support and syntax-highlighted code blocks.

## [v0.0.5] - 2026-05-01

### Added

- **Plugin System (The Alchemist):** Users can now extend Lulu by dropping JavaScript files into `~/.lulu/plugins/`. Tools are loaded dynamically at startup.
- **Web Dashboard:** A modern local web interface (React + Tailwind) to visualize project memory, MCP servers, and conversation history. Accessible via `/dashboard`.
- **Dynamic MCP Support:** Expanded MCP server discovery (including Claude Desktop) and dynamic lifecycle management via CLI tools.
- **Autonomous Browser Research:** Added `browser_search` and `browser_read` tools using Playwright for deep web discovery.
- **HTML to Markdown:** Integrated `turndown` for clean web content extraction.

### Changed

- API server now exposes sessions, prompt metadata, capabilities, command handling, websocket events, and redacted event payloads.

## [v0.0.4] - 2026-05-01

### Added

- **Async Tool Engine:** Upgraded the tool engine to support asynchronous operations.
- **MCP Core:** Initial integration with Model Context Protocol (MCP) servers (Stdio & HTTP).
- **Terminal UI v2:** Rebuilt the CLI using React + Ink for a modern, component-driven experience with ASCII art logo.
- **Context Window Management:** Automatic history summarization to prevent token limit issues.
- **Token & Cost Tracking:** Real-time token usage and estimated USD cost for every turn.
- **Auto-Memory Reflection:** Agent automatically reflects on completed tasks and updates project memory.
- **Semantic Search:** LLM-powered relevance scoring for deep file discovery.

## [v0.0.3] - 2026-05-01

### Added

- **Skill Library Manager (The Curator):** Tools for managing and consolidating the global skill library.
- **Elysia API Server:** High-performance API layer built with Bun.
- **Global Storage:** Moved configuration and history to `~/.lulu/`.

## [v0.0.2] - 2026-04-30

### Changed

- Updated project configuration and documentation.

## [v0.0.1] - 2026-04-29

### Added

- Initial project setup with TypeScript source.
