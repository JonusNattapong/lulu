# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Lulu Dashboard** — A real-time command center dashboard for the Lulu AI assistant. It connects to a local API server (port 19456) to display system status, conversation history, memory contents, MCP servers, plugins, and capabilities. Includes a WebSocket chat interface for interacting with the agent.

**Tech stack**: React 19 + TypeScript + Vite, Tailwind CSS 4, Recharts, Framer Motion, Lucide React icons, Axios

## Development Commands

```bash
# Install dependencies
pnpm install

# Start development server (Vite HMR on http://localhost:5173)
pnpm dev

# Build for production
pnpm build

# Preview production build locally
pnpm preview

# Lint codebase
pnpm lint

# Type-check (runs as part of build)
pnpm build
```

**Single test run** — This project does not include a test setup yet. If adding tests, use Vitest with `*.test.tsx` files alongside sources.

## Project Structure

```
src/
├── main.tsx              # Entry point — renders App into #root
├── App.tsx               # Main dashboard component (all tabs, state, WebSocket)
├── index.css             # Tailwind directives + custom .glass / .card-hover utilities
├── App.css               # (unused in current setup — legacy styles)
└── assets/               # Static images (hero.png, react.svg, vite.svg)

public/
├── favicon.svg
├── icons.svg
└── lulu.svg

Configuration:
├── vite.config.ts         # Vite config (base: './' for static hosting)
├── tailwind.config.cjs    # Tailwind with custom colors (background, glass)
├── tsconfig.json          # Project references to app + node configs
├── tsconfig.app.json      # App TypeScript: ES2023 target, React JSX, strict lint rules
└── tsconfig.node.json     # Node/script TypeScript config (vite types)
```

## Architecture

### Data Flow

1. **Polling** — `App.tsx` uses `useEffect` + `setInterval` to fetch 6 REST endpoints every 5 seconds:
   - `GET /status` → `{ status, provider, model, projectName, version }`
   - `GET /history` → `[{ timestamp, prompt, finalText, usage }]`
   - `GET /memory` → `{ content: string }`
   - `GET /mcp` → `[{ name, tools }]`
   - `GET /plugins` → `[{ name, description }]`
   - `GET /capabilities` → system capability detection (git, node, bun, browser, etc.)

2. **WebSocket** — Connects to `ws://localhost:19456/ws` for real-time chat streaming:
   - `session_start` → begins new session
   - `stream_token` → appends response token
   - `session_end` → stops loading, refetches data
   - `error` → displays error message

3. **State** — All UI state in `App.tsx`:
   - `activeTab` — current view ('overview', 'chat', 'memory', 'ecosystem', 'capabilities', 'history')
   - `status`, `memory`, `history`, `mcp`, `plugins`, `capabilities` — data from API
   - `streamText`, `streamSession`, `promptInput`, `isLoading` — WebSocket chat state

### UI Components

- **Inline components** — `StatCard` and `CapabilityCard` defined at the bottom of `App.tsx`
- **Tab views** — Conditional rendering via `activeTab` inside `<AnimatePresence>`
- **Styling** — Tailwind utility classes + custom `.glass` utility (rgba background + blur) for glassmorphism panels
- **Animations** — Framer Motion (`motion.div`, `AnimatePresence`) for tab transitions and chart loading

### API Contract

The dashboard expects the backend (Moltbot gateway) to expose these endpoints on `API_BASE` (default: `http://localhost:19456`):

| Endpoint | Response | Description |
|----------|----------|-------------|
| `GET /status` | `{ status, provider, model, projectName, version }` | Agent status summary |
| `GET /history` | `[{ timestamp, prompt, finalText, usage }]` | Conversation history |
| `GET /memory` | `{ content: string }` | Project memory/knowledge base |
| `GET /mcp` | `[{ name, tools: number }]` | MCP server registry |
| `GET /plugins` | `[{ name, description }]` | Custom plugins |
| `GET /capabilities` | `{ git, tmux, bun, node, browser, network, shell... }` | System capability detection |
| `WS /ws` | WebSocket events for chat streaming | Real-time conversation |

## Styling Notes

- **Glassmorphism** — panels use `bg-slate-800/70 backdrop-blur` via `.glass` class
- **Color scheme** — Dark theme base `#0f172a` (slate-900), accent colors: cyan (primary), purple (capabilities), pink (ecosystem), green (status), orange (history)
- **Typography** — System UI / Inter, monospace only for code blocks and memory view
- **Responsive** — Grid layouts adjust: `grid-cols-1 md:grid-cols-4`, `lg:col-span-2`, etc.

## Environment

- **API_BASE** — Hardcoded to `http://localhost:19456` in `App.tsx:29`. To change, edit `const API_BASE = ...` and rebuild.
- **Dev server** — Runs on `http://localhost:5173` by default (Vite).
- **Backend dependency** — The dashboard won't display data unless the Moltbot gateway is running locally on port 19456.

## Adding New Tabs / Features

1. New tab: add button in header nav (line ~161), then add a new `{activeTab === 'newtab' && (...)}` block inside `<AnimatePresence>`.
2. Fetch additional data: add to the `fetchData()` `Promise.all` array and corresponding `useState`.
3. Custom endpoint: extend the backend API, then mirror the fetch pattern in `App.tsx`.

Keep related changes localized to `App.tsx` when possible. If the feature grows complex, consider extracting components into `src/components/`.

## Code Style

- **TypeScript** — Strict mode via `tsconfig.app.json` (`noUnusedLocals`, `noUnusedParameters`, `erasableSyntaxOnly`)
- **Linting** — ESLint with `@eslint/js`, `typescript-eslint`, `react-hooks`, `react-refresh` (Vite)
- **Formatting** — No explicit formatter configured yet. Use Prettier-standard 2-space indent when in doubt.
- **Imports** — Prefer named imports from packages; avoid `import * as`.
- **Components** — Use `React.FC` type annotations and destructured props.

## Git Workflow

- Main branch: `main`
- Conventional commit messages recommended (`feat:`, `fix:`, `docs:`, `chore:`)
- Do not commit build artifacts (`dist/`) or dependency folders (`node_modules/`)

## Notes

- The dashboard uses a WebSocket to stream chat responses instead of REST for real-time token streaming.
- The backend endpoint was previously `/capabilities` which returned system detection data. If adding new endpoints, follow the same pattern in `fetchData()`.
- Stateless polling design — no WebSocket for status/memory/history; they refresh every 5s and on `session_end`.
