# Lulu Dashboard

Real-time command center for the Lulu AI assistant. Connects to a local Moltbot gateway (port 19456) to display system status, conversation history, memory contents, MCP servers, plugins, and capabilities — with built-in WebSocket chat.

<p align="center">
  <img src="https://via.placeholder.com/800x400/0f172a/22d3ee?text=Lulu+Command+Center" alt="Dashboard preview" />
</p>

## Features

- **Overview Tab** — Quick stats, token usage chart, live MCP server status
- **Chat Tab** — WebSocket-based streaming chat with Lulu
- **Memory Tab** — View project knowledge base
- **Ecosystem Tab** — MCP servers and custom plugins overview
- **Capabilities Tab** — System detection (git, node, bun, browser, network, shells)
- **History Tab** — Conversation logs with token usage

## Tech Stack

| Tool | Version |
|------|---------|
| React | 19.2.5 |
| TypeScript | ~6.0.2 |
| Vite | 8.0.10 |
| Tailwind CSS | 4.2.4 |
| Recharts | 3.8.1 |
| Framer Motion | 12.38.0 |
| Lucide React | 1.14.0 |
| Axios | 1.15.2 |

## Prerequisites

- **Node.js** 22+ (required by Moltbot gateway)
- **pnpm** package manager (recommended)
- **Moltbot gateway** running locally on port 19456

## Installation

```bash
cd dashboard
pnpm install
```

## Development

```bash
# Start Vite dev server (http://localhost:5173)
pnpm dev

# Run linter
pnpm lint

# Build for production
pnpm build

# Preview production build
pnpm preview
```

The dashboard polls the backend API every 5 seconds and maintains a WebSocket connection for real-time chat streaming.

## Backend API Integration

The dashboard expects these endpoints on `http://localhost:19456`:

| Endpoint | Method | Response |
|----------|--------|----------|
| `/status` | GET | `{ status, provider, model, projectName, version }` |
| `/history` | GET | `[{ timestamp, prompt, finalText, usage }]` |
| `/memory` | GET | `{ content: string }` |
| `/mcp` | GET | `[{ name, tools: number }]` |
| `/plugins` | GET | `[{ name, description }]` |
| `/capabilities` | GET | `{ git, bun, node, browser, network, shell... }` |
| `/ws` | WS | `session_start`, `stream_token`, `session_end`, `error` |

If the backend is not running, the dashboard shows loading states and empty data.

## Project Structure

```
dashboard/
├── src/
│   ├── App.tsx          # Main component (6 tabs, state, WebSocket)
│   ├── main.tsx         # React entry point
│   ├── index.css        # Tailwind + custom glassmorphism utilities
│   ├── App.css          # Unused legacy styles
│   └── assets/          # Static images
├── public/
│   ├── favicon.svg
│   ├── icons.svg
│   └── lulu.svg
├── dist/                # Production build output (gitignored)
├── node_modules/        # Dependencies (gitignored)
├── .gitignore
├── CLAUDE.md           # Claude Code agent instructions
├── package.json
├── tsconfig.json        # Project references
├── tsconfig.app.json    # App TS config (ES2023, React JSX)
├── tsconfig.node.json   # Node/script TS config
├── vite.config.ts       # Vite config (base: './' for static hosting)
├── tailwind.config.cjs  # Custom colors (background, glass)
├── eslint.config.js     # ESLint with react-hooks + react-refresh
└── README.md
```

## Configuration

**API_BASE** — Change the backend URL by editing `src/App.tsx` line 29:

```ts
const API_BASE = 'http://localhost:19456'; // your custom URL here
```

**Port** — Vite dev server runs on `5173` by default. Change in `vite.config.ts`.

## Deployment

The dashboard is configured with `base: './'` in `vite.config.ts` for static hosting. Build and deploy the `dist/` folder to any static host:

```bash
pnpm build
# Deploy dist/ to your host (GitHub Pages, Netlify, Vercel, etc.)
```

For environments where the backend runs on a different host/port, set the `API_BASE` in `App.tsx` before building.

## Styling

- **Theme**: Dark slate (`#0f172a`) with glassmorphism panels
- **Accent colors**: Cyan (primary), purple (capabilities), pink (ecosystem), green (status), orange (history)
- **Glass effect**: `.glass` class — `background: rgba(30,41,59,0.7) backdrop-filter: blur(12px)`
- **Typography**: System UI / Inter; monospace for code blocks and memory view

## Code Style

- TypeScript strict mode (`noUnusedLocals`, `noUnusedParameters`, `erasableSyntaxOnly`)
- ESLint with `@eslint/js`, `typescript-eslint`, `react-hooks`, `react-refresh`
- Prefer named imports, avoid `import * as`
- Components use `React.FC` type annotations

## Adding Features

**New tab**: Add a button to the header nav, then render a new `<motion.div>` inside `<AnimatePresence>` with `key="tabname"`.

**New API field**: Add to `fetchData()` Promise.all, new `useState` hook, then display in the appropriate tab.

**New component**: If code grows beyond ~200 lines in App.tsx, extract to `src/components/YourComponent.tsx`.

## Troubleshooting

**Dashboard shows no data** — Ensure Moltbot gateway is running: `moltbot gateway run --port 19456`

**WebSocket fails** — Check that port 19456 WebSocket is accessible: `ws://localhost:19456/ws`

**CORS errors** — The gateway runs locally; ensure no VPN/firewall blocks port 19456 REST+WS.

**Build fails** — Delete `node_modules` and run `pnpm install` again. Verify Node.js 22+.

## License

Private project — part of the Moltbot ecosystem.
