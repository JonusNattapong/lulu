# Lulu

Lulu is an autonomous, AI-first coding assistant designed for local development. It understands your codebase, remembers decisions through persistent memory, and executes complex workflows across multiple AI providers.

---

## Key Features

- **Autonomous Agent Loop:** Performs multi-round reasoning to solve complex development tasks.
- **Project Memory:** Persistent structured knowledge about your codebase stored in `~/.lulu/projects/`.
- **Multi-Provider Support:** Seamless integration with Anthropic, OpenAI, Google Gemini, DeepSeek, and others.
- **Global Storage:** Centralized configuration and history in `~/.lulu/` (home directory).
- **Agent-Optimized:** Built-in `.claude` instructions and modular rules for optimized AI performance.
- **JSON-First Configuration:** Internal schemas and settings use JSON for simplified extensibility.

---

## Quick Start

### Prerequisites
- Node.js 22 or newer
- npm or pnpm

### Installation
```sh
npm install
npm run build
```

### API Configuration
Configure your keys via environment variables or the global config file at `~/.lulu/config.json`:
```json
{
  "apiKeys": {
    "anthropic": "your-key-here",
    "openai": "your-key-here"
  }
}
```

---

## Usage

### Interactive REPL
```sh
npm run lulu
```
- `/curate`: Optimize your global skill library.
- `/help`: Show available commands and environment variables.
- `/exit` or `/quit`: End the session.

### Single Prompt Execution
```sh
npm run lulu -- "Explain the architecture of this project"
```

---

## Configuration

Lulu is customizable via environment variables and `~/.lulu/config.json`:

| Variable | Description | Default |
| --- | --- | --- |
| `LULU_PROVIDER` | AI Service Provider | `claude` |
| `LULU_MODEL` | Specific Model ID | Provider Default |
| `LULU_ALLOW_WRITE` | Enable `write_file` tool | `false` |
| `LULU_ALLOW_COMMAND`| Enable `run_command` tool | `false` |

---

## Project Documentation

Detailed guides for contributors and system understanding:
- [ARCHITECTURE.md](./ARCHITECTURE.md): System design and data flow.
- [CONTRIBUTING.md](./CONTRIBUTING.md): Guidelines for adding tools and providers.
- [ROADMAP.md](./ROADMAP.md): Future goals and development phases.
- [DECISIONS.md](./DECISIONS.md): Record of architectural decisions.

---

## Safety
By default, Lulu operates in Read-Only mode. To enable file modifications or command execution, set `LULU_ALLOW_WRITE=true` and `LULU_ALLOW_COMMAND=true` in your environment.

---

## License
MIT
