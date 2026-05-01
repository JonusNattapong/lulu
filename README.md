# 🌸 Lulu AI (v0.0.4)

Lulu is an **Autonomous AI Coding Assistant** designed for local development. It doesn't just suggest code; it understands your architecture, remembers your decisions, researches the web, and executes complex workflows with precision.

```text
  _      _    _   _      _    _ 
 | |    | |  | | | |    | |  | |
 | |    | |  | | | |    | |  | |
 | |____| |__| | | |____| |__| |
 |______|______| |______|______|
       v0.0.4 | Autonomous AI Assistant
```

---

## ✨ Key Features

- **🌐 Autonomous Browser Research:** Lulu can search the web and read documentation in real-time using Playwright (Chromium), converting messy HTML into clean Markdown for reasoning.
- **🎨 Modern Ink UI:** A beautiful, React-based terminal interface with real-time streaming, interactive spinners, and syntax-highlighted output.
- **🧠 Project Memory & Reflection:** Automatically reflects on tasks and updates persistent knowledge about your codebase in `~/.lulu/projects/`.
- **🔍 Semantic Search:** LLM-powered relevance scoring to find the right code patterns even when keywords don't match.
- **💰 Token & Cost Tracking:** Transparent, real-time monitoring of token consumption and estimated USD costs for every interaction.
- **🛠️ MCP Integration:** Connects to the **Model Context Protocol** ecosystem to bring external tools (Databases, Slack, Drive) directly into your terminal.
- **⚡ Bun-Powered Performance:** Built with Bun for ultra-fast startup times and high-performance execution.

---

## 🚀 Quick Start

### 1. Prerequisites
- [Bun](https://bun.sh/) (Recommended) or Node.js 22+

### 2. Installation

**Quick Install (Recommended):**

- **Linux/macOS:**
  ```sh
  curl -fsSL https://raw.githubusercontent.com/JonusNattapong/lulu/main/scripts/install.sh | bash
  ```
  (Or clone and run `./scripts/install.sh`)

- **Windows (PowerShell):**
  ```powershell
  irm https://raw.githubusercontent.com/JonusNattapong/lulu/main/scripts/install.ps1 | iex
  ```
  (Or clone and run `.\scripts\install.ps1`)

**Manual Install:**
```sh
git clone https://github.com/JonusNattapong/lulu.git
cd lulu
bun install
bun run build
```

### 3. API Configuration
Create a config file at `~/.lulu/config.json`:
```json
{
  "apiKeys": {
    "anthropic": "your-anthropic-key",
    "openai": "your-openai-key"
  }
}
```

---

## 🛠️ Usage

### Interactive REPL (Recommended)
Launch the beautiful Ink-based interface:
```sh
bun run lulu
```

### One-Shot Execution
```sh
bun run lulu -- "Explain the authentication flow in this project"
```

### Core Commands (REPL)
- `/help`: Show available commands and environment variables.
- `/exit`: End the session.
- **Esc**: Quick exit.

---

## ⚙️ Configuration

| Variable | Description | Default |
| --- | --- | --- |
| `LULU_PROVIDER` | AI Provider (claude, openai, deepseek, etc.) | `claude` |
| `LULU_MODEL` | Specific Model ID | Provider Default |
| `LULU_ALLOW_WRITE` | Enable file writing (Security) | `false` |
| `LULU_ALLOW_COMMAND`| Enable terminal commands (Security) | `false` |

---

## 🛡️ Safety & Security
By default, Lulu operates in **Read-Only** mode. To grant Lulu the power to modify files or run commands, explicitly set:
```sh
export LULU_ALLOW_WRITE=true
export LULU_ALLOW_COMMAND=true
```

---

## 📖 Project Structure
- [ARCHITECTURE.md](./ARCHITECTURE.md): System design.
- [ROADMAP.md](./ROADMAP.md): Future vision.
- [CHANGELOG.md](./CHANGELOG.md): Version history.

---

## 📄 License
MIT
