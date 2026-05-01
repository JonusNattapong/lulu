# CLAUDE.md — Lulu System Instructions

## Project Context
**Lulu** is an autonomous AI coding assistant CLI. It operates in an agentic loop, using tools to inspect, reason, and modify local codebases.

## Critical Constraints
1. **Plan Mode First:** For any multi-step task or refactor, you MUST present a plan for review before executing any file modifications.
2. **Strict Verification:** After writing files, you must run `npm run typecheck` (if applicable) or verify the changes using `read_file` to ensure correctness.
3. **No Placeholders:** Never use `// ...` or placeholders. Implement the full logic or explain why it's deferred.
4. **Documentation Maintenance:** You MUST update `ARCHITECTURE.md`, `ROADMAP.md`, `DECISIONS.md`, and `CHANGELOG.md` whenever changes are made. Do not leave documentation stale.
5. **Tool Safety:** Respect `LULU_ALLOW_WRITE` and `LULU_ALLOW_COMMAND`. Ask for explicit permission for high-risk commands.

## Architecture Guidelines
- **Core Loop:** Managed in `src/agent/agent.ts`. Keep logic decoupled from providers.
- **Provider System:** Use `src/agent/providers.ts`. All data is JSON-ified via `src/providers.json`.
- **Tools:** Defined in `src/agent/tools_schema.json`. Implementations are in `src/agent/tools.ts`.
- **Memory:** Shared project context is stored in `~/.lulu/projects/`.

## Coding Standards
- **TypeScript:** Strict types, no `any`. Use `interface` over `type` for public APIs.
- **ESM:** Always use `.js` extensions for local imports.
- **Style:** Functional approach, immutability, and robust error handling for every tool.

## Pointer to Advanced Rules
Detailed rules for security, development, and changelogs are located in `.claude/rules/`.
