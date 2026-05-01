# Lulu Roadmap

Our goal is to create the most intuitive and powerful CLI-based AI assistant for local development.

## Phase 1: Foundation (Completed)
- [x] Basic REPL and agent loop.
- [x] Multi-provider support (Anthropic, OpenAI, etc.).
- [x] Core toolset (read/write/list/search/command).
- [x] Centralized global config in `~/.lulu/`.
- [x] JSON-ified configuration and schemas.

## Phase 2: Intelligence & Context (Completed)
- [x] **Project Memory:** Persistent storage of project-specific knowledge.
- [x] **Context Window Management:** Automatic summarization of long conversations.
- [x] **Semantic Search:** LLM-powered relevance scoring for file discovery.
- [x] **Auto-Memory:** Agent autonomously updates memory after tasks.

## Phase 3: Enhanced UX & Interface (Completed)
- [x] **Rich Terminal UI (v2):** Rebuilt CLI using React and Ink with ASCII Art.
- [x] **Token & Cost Tracking:** Real-time usage and cost display.
- [x] **Incremental Streaming:** Real-time text delta streaming in the UI.

## Phase 4: Ecosystem & Integration (In Progress)
- [x] **The Alchemist (Plugin System):** Dynamic tool loading from local files.
- [x] **Autonomous Browser Research:** Web searching and reading capabilities.
- [x] **Elysia Server:** High-performance API layer built with Bun.
- [x] **Telegram Chat Gateway:** Chat-style control surface with per-chat context.
- [x] **Central Session System:** Shared persisted sessions across CLI, API, dashboard, and Telegram.
- [x] **Prompt Layer System:** Composable base, profile, project, memory, skill, and task prompt layers.
- [ ] **MCP Support (Dynamic):** Fully automated MCP server discovery and lifecycle.
- [ ] **Web Dashboard:** A local web UI to complement the CLI experience.

## Phase 5: OpenClaw / Hermes-Inspired Agent Runtime

The next stage is to make Lulu feel like a persistent personal agent instead of a set of entrypoints.

- [ ] **Unified Command Runtime:** Route `/status`, `/project`, `/prompt`, `/task`, `/tools`, `/memory`, and `/model` through one registry across CLI, API, dashboard, and Telegram.
- [ ] **Project Runtime:** Make the project profile the root object for prompts, sessions, memory, tasks, allowed tools, scripts, and workspace indexing.
- [ ] **Tool Permission Matrix:** Define tool access by channel, project, user, risk level, and approval mode.
- [ ] **Audit Log:** Record commands, tool calls, policy decisions, task events, and errors with redacted secrets.
- [ ] **Job Scheduler:** Add recurring and delayed tasks such as daily summaries, repo health checks, and scheduled Telegram reports.
- [ ] **Skill Capture Loop:** Let Lulu propose reusable skills after successful workflows, with user review before activation.
- [ ] **Sub-Agent Runtime:** Run isolated child sessions for parallel research, code edits, tests, and long-running tmux jobs.
- [ ] **Execution Backends:** Support local shell, tmux, Docker, SSH, and future remote runners through the same execution interface.
- [ ] **Observability Dashboard:** Show sessions, tasks, live events, tool calls, policy blocks, and active terminals.
- [ ] **Trajectory Export:** Export sessions and tool traces for debugging, evaluation, and future fine-tuning datasets.

## Future Vision
- Autonomous multi-agent coordination for large-scale refactors.
- Real-time pair programming integration with popular IDEs via a local server.
- Always-on personal agent mode with scheduled work, chat notifications, and reviewable memory growth.
