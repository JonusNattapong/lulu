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

## Phase 3: Enhanced UX & Interface
- [x] **Rich Terminal UI (v2):** Rebuilt CLI using React and Ink with ASCII Art.
- [x] **Token & Cost Tracking:** Real-time usage and cost display.
- [ ] **Progress Indicators:** Detailed visual feedback for tool execution.
- [ ] **Browser Integration:** Lightweight browser tool for web research.

## Phase 4: Ecosystem & Integration
- [ ] **MCP Support:** Integrate with Model Context Protocol servers.
- [ ] **Plugin System:** Allow users to add custom tools via external JSON/JS files.
- [x] **Elysia Server:** High-performance API layer built with Bun.
- [ ] **Web Dashboard:** A local web UI to complement the CLI experience.

## Future Vision
- Autonomous multi-agent coordination for large-scale refactors.
- Real-time pair programming integration with popular IDEs via a local server.
