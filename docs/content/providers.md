# Providers

Lulu supports a wide variety of AI Providers. Through the Provider Manager, Lulu abstracts away the specific API differences, allowing you to seamlessly switch between models using the `/provider` command.

## Supported Providers
- **Anthropic:** Native support for Claude 3 Opus, Sonnet, and Haiku.
- **OpenAI:** GPT-4o, GPT-4 Turbo, GPT-3.5.
- **Google:** Gemini Pro, Flash via Google AI Studio.
- **Mistral:** Mistral Large, Mistral Nemo.
- **DeepSeek:** DeepSeek Coder, DeepSeek Chat.
- **OpenRouter / KiloCode / OpenCode:** Standardized endpoints for proxying or enterprise routing.

## Selecting a Provider
Type `/provider [name]` in the TUI to switch. Lulu will attempt to dynamically fetch the available models for that provider via their `/models` endpoint.
