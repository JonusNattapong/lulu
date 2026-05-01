# Lulu Roadmap

Our goal is to create the most intuitive and powerful CLI-based AI assistant for local development.

## Phase 1: Foundation (Completed)
- [x] Basic REPL and agent loop.
- [x] Multi-provider support (Anthropic, OpenAI, etc.).
- [x] Core toolset (read/write/list/search/command).
- [x] Centralized global config in `~/.lulu/`.
- [x] JSON-ified configuration and schemas.

## Phase 2: Intelligence & Context (In Progress)
- [x] **Project Memory:** Persistent storage of project-specific knowledge.
- [ ] **Context Window Management:** Automatic summarization of long conversations.
- [ ] **Semantic Search:** Replace grep with embedding-based file search.
- [ ] **Auto-Memory:** Allow the agent to autonomously update its project memory.

## Phase 3: Enhanced UX & Interface
- [ ] **Rich Terminal UI:** Markdown rendering and syntax highlighting in output.
- [ ] **Progress Indicators:** Visual feedback for long AI operations.
- [ ] **Browser Integration:** Lightweight browser tool for web research.

## Phase 4: Ecosystem & Integration
- [ ] **MCP Support:** Integrate with Model Context Protocol servers.
- [ ] **Plugin System:** Allow users to add custom tools via external JSON/JS files.
- [x] **Elysia Server:** High-performance API layer built with Bun.
- [ ] **Web Dashboard:** A local web UI to complement the CLI experience.

## Future Vision
- Autonomous multi-agent coordination for large-scale refactors.
- Real-time pair programming integration with popular IDEs via a local server.
