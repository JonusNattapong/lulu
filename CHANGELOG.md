# Changelog

All notable changes to the Lulu project will be documented in this file.

## [0.0.3] - 2026-05-01

### Added
- **The Curator:** Implemented `curate_skills` and `update_skills_batch` tools to manage and consolidate the global skill library.
- **Skill Crystallization:** Implemented `save_skill` tool to allow the agent to save and reuse successful workflow patterns.
- **Global Skill Library:** Skills are stored in `~/.lulu/skills.json` and automatically injected into the system prompt.
- **Premium CLI UI:** Added terminal styling with `picocolors` and a cyan header.
- **Onboarding Wizard:** Added an interactive setup for new users to configure API keys.
- **Elysia Server:** Added a high-performance API layer using Elysia and Bun.
- **Bun Support:** Switched to Bun as the primary runtime for faster development.
- **Global Storage:** Moved configuration and history to `~/.lulu/` directory.
- **Project Memory:** Implemented persistent structured knowledge for individual projects via `memory.json`.
- **JSON-ified Configuration:** Extracted tool definitions and provider mappings to external JSON files.
- **Advanced Documentation:** Added `ARCHITECTURE.md`, `CONTRIBUTING.md`, `ROADMAP.md`, and `DECISIONS.md`.
- **Workspace Rules:** Implemented `.claude/` folder structure with modular rules and commands.

### Changed
- **Agent Architecture:** Updated `runAgent` to support streaming callbacks for CLI and Web integration.
- **Logging:** Changed conversation history format to JSON Lines (`history.jsonl`).
- **Config Loading:** Improved configuration logic to merge global settings with environment variables.

---
## [0.0.1] - 2026-04-29
- Initial release with basic agent loop and file system tools.
