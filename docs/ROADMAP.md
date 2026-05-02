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

## Phase 4: Ecosystem & Integration (Completed)
- [x] **The Alchemist (Plugin System):** Dynamic tool loading from local files.
- [x] **Autonomous Browser Research:** Web searching and reading capabilities.
- [x] **Elysia Server:** High-performance API layer built with Bun.
- [x] **Telegram Chat Gateway:** Chat-style control surface with per-chat context.
- [x] **Central Session System:** Shared persisted sessions across CLI, API, dashboard, and Telegram.
- [x] **Prompt Layer System:** Composable base, profile, project, memory, skill, and task prompt layers.
- [x] **MCP Support (Dynamic):** Fully automated MCP server discovery and lifecycle.
- [x] **Web Dashboard:** A local web UI to complement the CLI experience.
- [x] **Skill System v2:** File-based skills with resolver and smart retrieval
- [x] **Knowledge Brain:** Pages, entities, relationships with hybrid search
- [x] **Interactive Approval:** CLI approval system for high-risk actions

## Phase 5: OpenClaw / Hermes-Inspired Agent Runtime (Completed)

The next stage is to make Lulu feel like a persistent personal agent instead of a set of entrypoints.

- [x] **Unified Command Runtime:** Route `/status`, `/project`, `/prompt`, `/task`, `/tools`, `/memory`, `/model` through one registry across CLI, API, dashboard, and Telegram.
- [x] **Skill Capture Loop:** Let Lulu propose reusable skills after successful workflows, with user review before activation.
- [x] **Audit Log:** Record commands, tool calls, policy decisions, task events, and errors with redacted secrets.
- [x] **Sub-Agent Runtime:** Run isolated child sessions for parallel research, code edits, tests, and long-running tmux jobs.
- [x] **Execution Backends:** Support local shell, tmux, Docker, SSH, and future remote runners through the same execution interface.
- [x] **Observability Dashboard:** Show sessions, tasks, live events, tool calls, policy blocks, and active terminals.
- [x] **Trajectory Export:** Export sessions and tool traces for debugging, evaluation, and future fine-tuning datasets.

## Phase 6: Autonomous Agent (Completed)

- [x] **Autonomous multi-agent coordination** for large-scale refactors. Tools: `orchestrate_task`, `list_coordination_tasks`.
- [x] **Always-on personal agent mode** with scheduled work, chat notifications, and reviewable memory growth. Tools: `always_on_status`, `configure_always_on`, `send_notification`, `notification_history`.

## Future Vision
- Real-time pair programming integration with popular IDEs via a local server.
