# Changelog

All notable changes to the Lulu project will be documented in this file.

## [Unreleased]

### Added
- (new changes here)

## [v0.0.7] - 2026-05-01

### Added
- **Edit Command:** Added `/edit` command for batch file editing with AI-suggested changes.
- **Message History Navigation:** Reverse chronological message history with keyboard navigation in the terminal UI.
- **Status Bar:** Real-time status bar showing model, provider, and session info in the terminal UI.
- **Telegram Pairing Wizard:** Added `telegram:setup` to validate a bot token, approve a Telegram chat from the host terminal, and persist approved bindings in `~/.lulu/telegram.json`.
- **Gateway Runtime:** Added a central gateway for API, dashboard, and Telegram routing, including per-route queues, session resolution, command handling, agent execution, and message persistence.
- **Identity and Binding System:** Added central users, roles, channel bindings, project bindings, and agent bindings in `~/.lulu/identity.json`, with Telegram setup writing identity bindings during pairing.
- **SOUL File System:** Added Obsidian-compatible `.lulu/*.md` behavior files and `/soul init`.
- **Skill Retrieval:** Prompt construction now selects relevant learned skills instead of injecting the entire skill store.
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
