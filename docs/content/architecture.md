# Architecture Overview

Lulu is built using **TypeScript** on top of **Node.js**, using **React (Ink)** for rendering the interactive terminal interface.

## Core Components

1. **Terminal UI (`src/ui`):** A React-based command-line interface handling complex states like real-time model searching, command autosuggestions, and threaded chat history.
2. **Provider Manager (`src/providers`):** Abstracted adapters that normalize interactions with multiple AI APIs. Supports OpenAI-compatible endpoints natively, allowing proxying to local LLMs (like Ollama or OpenCode) via `process.env.PROVIDER_BASE_URL` overrides.
3. **Tool Execution Engine (`src/tools`):** An asynchronous pipeline that allows the LLM to request actions (like reading a file or running a bash command) and securely pipes the results back into the conversation context.
4. **Config & Memory (`src/core`):** Manages local state, API keys via `.env`, and semantic memory structures.
