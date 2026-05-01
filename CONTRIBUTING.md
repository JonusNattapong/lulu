# Contributing to Lulu

We welcome contributions! Whether you're a human or an AI agent, follow these guidelines to keep the project clean and consistent.

## Setup
1. Clone the repository.
2. Install dependencies: `npm install`.
3. Create a `.env` file based on `.env.example`.
4. Run in dev mode: `npm run dev`.

## Development Standards
- **Strict TypeScript:** No `any`. Ensure all types are properly defined in `src/types.ts`.
- **ESM Compliance:** This is a pure ESM project. All imports must include the `.js` extension.
- **JSON-ification:** If you're adding new configurations or tool schemas, put them in `.json` files in the `src/` directory.

## Adding a New Tool
1. Define the tool's input schema in `src/agent/tools_schema.json`.
2. Implement the tool's logic in the `executeToolImpl` function within `src/agent/tools.ts`.
3. If the tool is destructive, ensure it checks the appropriate permission environment variable.

## Adding a New Provider
1. Update `src/providers.json` with the new provider's default model and config map.
2. Update the `ModelProvider` type in `src/types.ts`.
3. Handle the new provider's API calls in `src/agent/providers.ts`.

## Commit Style
We follow **Conventional Commits**:
- `feat:` for new features.
- `fix:` for bug fixes.
- `docs:` for documentation changes.
- `refactor:` for code changes that neither fix a bug nor add a feature.

## AI Agent Workflow
If you are an AI agent:
1. Always read `CLAUDE.md` and `.claude/instructions.md` first.
2. Propose a plan before making multi-file changes.
3. Run `npm run build` or `npm run typecheck` to verify your changes.
