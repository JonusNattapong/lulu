# Architecture Decision Records (ADR)

This document records the key architectural decisions made for Lulu and the rationale behind them.

## ADR 1: Global Storage in `~/.lulu/`
- **Status:** Accepted
- **Context:** We needed a place to store persistent data (config, history, memory) that isn't tied to a specific repository.
- **Decision:** Use a hidden `.lulu` directory in the user's home directory.
- **Rationale:** Standard practice for CLI tools (e.g., `~/.ssh`, `~/.npm`). It prevents cluttering project folders and allows Lulu to carry knowledge across different codebases.

## ADR 2: JSON-First Configuration
- **Status:** Accepted
- **Context:** Initially, tool definitions and provider mappings were hardcoded in TypeScript.
- **Decision:** Move all static metadata and schemas to `.json` files in the `src/` directory.
- **Rationale:** Decouples data from logic. Makes the system easier to extend and allows AI agents to "understand" the system structure by reading simple JSON files.

## ADR 3: JSON Lines for History (`history.jsonl`)
- **Status:** Accepted
- **Context:** We needed a way to log full conversation transcripts.
- **Decision:** Use JSON Lines format.
- **Rationale:** Efficient for append-only logging. Each turn is a valid JSON object, making it easy to parse and analyze later while being more robust than a single large JSON array.

## ADR 4: Functional Agent Loop
- **Status:** Accepted
- **Context:** The agent needs to manage state across multiple tool-use rounds.
- **Decision:** Implement a stateless loop that passes the entire message history back to the provider in each round.
- **Rationale:** Simplifies the logic and makes the agent's behavior deterministic and easy to debug.
