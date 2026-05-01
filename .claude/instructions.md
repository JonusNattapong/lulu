# Lulu Project Instructions

This directory contains project-specific context and rules for AI agents.

## Core Rules
- **Strict TypeScript:** Do not use `any`. Define interfaces for all data structures.
- **ESM Modules:** This project uses ES Modules. Ensure all imports include the `.js` extension.
- **Tool Safety:** Always check `LULU_ALLOW_WRITE` and `LULU_ALLOW_COMMAND` environment variables before performing destructive actions.
- **Functional Approach:** Prefer pure functions and immutability.

## Project Structure
- `src/index.ts`: Entry point for CLI/REPL.
- `src/agent/agent.ts`: Main agent loop logic.
- `src/agent/tools.ts`: Definitions for built-in tools (`read_file`, `write_file`, etc.).
- `src/agent/providers.ts`: Integration with AI providers (Anthropic, OpenAI, etc.).

## Common Workflows
- **Debugging Streaming:** Check the `sendToProviderStream` function in `providers.ts`.
- **Adding Tools:** Add new tool definitions to `BUILTIN_TOOLS` and implement logic in `executeTool`.
