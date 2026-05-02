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
- [x] **Plugin System (The Alchemist):** Dynamic tool loading from local files.
- [x] **Autonomous Browser Research:** Web searching and reading capabilities.
- [x] **Elysia Server:** High-performance API layer built with Bun.
- [x] **Telegram Chat Gateway:** Chat-style control surface with per-chat context.
- [x] **Central Session System:** Shared persisted sessions across CLI, API, dashboard, and Telegram.
- [x] **Prompt Layer System:** Composable base, profile, project, memory, skill, and task prompt layers.
- [x] **MCP Support (Dynamic):** Fully automated MCP server discovery and lifecycle.
- [x] **Web Dashboard:** A local web UI to complement the CLI experience.
- [x] **Skill System v2:** File-based skills with resolver and smart retrieval.
- [x] **Knowledge Brain:** Pages, entities, relationships with hybrid search.
- [x] **Interactive Approval:** CLI approval system for high-risk actions.
- [x] **Identity and Binding System:** Central users, roles, and channel bindings.

## Phase 5: Agent Runtime (Completed)
- [x] **Sub-Agent Runtime:** Spawn isolated child sessions for parallel research, code edits, tests. Tools: `spawn_agent`, `wait_for_agents`, `agent_status`, `list_agents`, `abort_agent`.
- [x] **Observability Dashboard:** New "Agents" tab with sub-agent monitor, active sessions table, and real-time event log via WebSocket.
- [x] **Trajectory Export:** Export sessions as JSON/JSONL for debugging, evaluation, and fine-tuning datasets. Tools: `export_trajectory`, `list_trajectories`, `load_trajectory`.
- [x] **Execution Backends:** Unified execution interface for local shell, tmux, Docker, and SSH. Tools: `run_in_backend`, `list_backends`, `execution_status`, `list_executions`, `abort_execution`.
- [x] **Audit Log:** Record commands, tool calls, policy decisions, task events, and errors with redacted secrets. Tools: `audit_query`, `audit_stats`, `audit_errors`.
- [x] **Notification Manager:** Multi-channel notification dispatch (Telegram, webhook). Tools: `send_notification`, `notification_history`.

## Phase 6: Autonomous Multi-Agent (Completed)
- [x] **Autonomous multi-agent coordination** for large-scale refactors. Tools: `orchestrate_task`, `list_coordination_tasks`.
- [x] **Always-on personal agent mode** with scheduled work, chat notifications, and reviewable memory growth. Tools: `always_on_status`, `configure_always_on`.
- [x] **32 Built-in Skills** organized by category (brain, code, git, web, tasks, research, skills, setup, operational).
- [x] **Skill Curation System:** Analyze, optimize, and merge skills automatically.
- [x] **LSP Neovim Integration:** Language Server Protocol for code actions, explain, fix, refactor.

## Phase 7: Personal AI Agent (Completed)
- [x] **Personal Agent Daemon:** Persistent background process with always-on context across sessions. `bun run daemon:start`.
- [x] **User Profile System:** Persistent user preferences, learnings, skill proposals, personality in `~/.lulu/user-profile.json`.
- [x] **Skill Proposal Engine:** Auto-detects repetitive tool usage (5+ times), proposes skills for user review, creates `SKILL.md` on approval. `/proposals list|approve|reject`.
- [x] **Proactive Suggestion Engine:** Pattern detection from session events, surface suggestions at session start or via Telegram. `/suggestions list|dismiss`.
- [x] **Global Memory:** Cross-session persistent facts, todos, and research queue in `~/.lulu/global-memory.json`. `/memory list|add|search`.
- [x] **Background Task Queue:** Automation queue with scheduler (every 30s), auto-executes due tasks. `/queue list|add|run|cancel`.
- [x] **Autonomous Research Mode:** Background research without user prompt, extracts summary/findings/sources/facts, stores in global memory. `/research`.
- [x] **Preference Learning:** Tracks preferences from corrections, accepted/rejected suggestions, repeated tool usage. `/learn key=value`, `/preferences`.
- [x] **Electron Desktop App:** System tray icon, global shortcuts (Ctrl+Shift+L, Ctrl+Shift+K), daemon management, auto-start on boot.
- [x] **Auto-Start on Boot:** Windows Task Scheduler, macOS LaunchAgent, Linux systemd unit via `scripts/install-daemon.sh/ps1`.
- [x] **Personal Agent Dashboard:** Real-time daemon status, skill proposals, proactive suggestions, learned preferences in web dashboard "Personal Agent" tab.

## Future Vision
- Real-time pair programming integration with popular IDEs via a local server.
- Cross-platform mobile app (iOS/Android) for remote control.
- Fine-tuning pipeline using exported trajectories.
- Team collaboration with shared skills and brain.
- Cloud bridge for remote gateway access via Tailscale or similar.
- Voice mode for hands-free interaction.