# Changelog

All notable changes to the Lulu project will be documented in this file.

## [0.0.4] - 2026-05-01

### Added
- **Autonomous Browser Research:** Added `browser_search` and `browser_read` tools using Playwright for web research and real-time knowledge discovery.
- **HTML to Markdown:** Integrated `turndown` for clean, AI-friendly web content consumption.
- **Ink-based Terminal UI (v2):** Rebuilt the CLI using React and Ink for a modern, component-driven experience with ASCII Art logo.
- **Context Window Management:** Implemented automatic history summarization to prevent token limit issues.
- **Token & Cost Tracking:** Displays real-time token usage and estimated USD cost for every turn.
- **Auto-Memory Reflection:** Agent now automatically reflects on completed tasks and updates project memory.
- **Semantic Search Tool:** Added `semantic_search` with LLM-powered relevance scoring for deep file discovery.
- **Async Tool Execution:** Upgraded the tool engine to support asynchronous operations.
- **MCP Core Support:** Initial integration with Model Context Protocol (MCP) servers (Stdio & HTTP).

## [0.0.3] - 2026-05-01
- **The Curator:** Tools for managing and consolidating global skill library.
- **Elysia Server:** High-performance API layer built with Bun.
- **Global Storage:** Moved configuration and history to `~/.lulu/`.

---
## [0.0.1] - 2026-04-29
- Initial release.
