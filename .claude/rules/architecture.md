# Project Architecture

- **Agent Loop:** Found in `src/agent/agent.ts`. It manages the conversation state and tool execution cycle (max 10 rounds).
- **Providers:** `src/agent/providers.ts` handles the normalization between Anthropic and OpenAI-compatible APIs. 
- **Streaming:** The project supports streaming responses via `sendToProviderStream`.
- **Tools:** Built-in tools are defined in `src/agent/tools.ts`. New tools should follow the `ToolDef` interface.
