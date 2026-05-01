# Skill: Add AI Provider

This skill allows Claude to autonomously integrate a new AI provider into the Lulu framework.

## Context
Lulu uses a normalized provider system in `src/agent/providers.ts`.

## Steps
1. **Define Provider Type:** Update `ModelProvider` type in `src/types.ts`.
2. **Update Config Logic:** Add the new provider to the `getBaseUrl` function in `src/agent/providers.ts`.
3. **Handle Routing:** Update the `switch` statements in `sendToProvider` and `sendToProviderStream`.
4. **Implement Special Logic:** If the provider requires a unique message format or API call (non-OpenAI compatible), implement a dedicated function (e.g., `sendToNewProvider`).
5. **Test Connection:** Suggest the user add the necessary API key to `.env` and try a test prompt.
