# Current Implementation Status

## Implemented Features (as of 2026-05-02)

### Tabs (6 total)

| Tab | Status | Description |
|-----|--------|-------------|
| **Overview** | ✅ Live | Stats grid (4 cards), token usage area chart (last 10 sessions), MCP server terminal list |
| **Chat** | ✅ Live | WebSocket streaming prompt interface with live response output |
| **Memory** | ✅ Live | Project knowledge base monospace view |
| **Ecosystem** | ✅ Live | Two-column layout: MCP servers + Custom plugins |
| **Capabilities** | ✅ Live | Grid of system detection (git, tmux, bun, node, browser, network, shells) |
| **History** | ✅ Live | Reverse-chronological session cards with user/assistant message bubbles |

### Data Fetching

- **/status** — Polled every 5s; displays provider, model, project name, version
- **/history** — Polled every 5s; also refreshed after chat session ends; used for chart + history tab
- **/memory** — Polled every 5s; raw text content display
- **/mcp** — Polled every 5s; MCP server list with tool counts
- **/plugins** — Polled every 5s; custom plugin registry
- **/capabilities** — Polled every 5s; system detection with graceful failure fallback

### WebSocket Chat

- `ws://localhost:19456/ws`
- Events: `connected`, `session_start`, `stream_token`, `session_end`, `error`
- UI: Stream token accumulation in `streamText` state, loading indicator
- Post-session: Auto-refresh all REST data on `session_end`

### Visual Design

- Dark slate theme (`#0f172a`)
- Glassmorphism panels (`.glass` class — `rgba(30,41,59,0.7) backdrop-blur`)
- Cyan primary accent, purple secondary (capabilities), pink tertiary (plugins)
- Frappe Motion tab transitions + Recharts area chart
- Responsive grid: `md:` and `lg:` breakpoints

### Build & Dev

- Vite dev server on port 5173
- Production build outputs to `dist/`
- ESLint configured with React hooks + refresh rules
- Tailwind CSS v4 with custom config in `tailwind.config.cjs`

## API Endpoints Required

The dashboard depends on the following backend being available at `http://localhost:19456`:

```
GET  /status
GET  /history
GET  /memory
GET  /mcp
GET  /plugins
GET  /capabilities
WS   /ws
```

**Backend context:** These endpoints are provided by the Moltbot gateway (see parent repository `claude-code-mark1/src/`).

## Known Gaps

| Item | Status | Notes |
|------|--------|-------|
| Unit tests | ❌ Not set up | Vitest not configured; no test files exist |
| Error boundaries | ⚠️ Partial | REST failures logged but UI doesn't show explicit error states |
| WebSocket reconnection | ❌ Missing | Connection error = stale UI until page refresh |
| API configurability | ⚠️ Hardcoded | `API_BASE` is a constant in `App.tsx`; no env-variable override |
| Loading skeletons | ⚠️ Basic | Uses empty states; no shimmer/skeleton loaders |
| Empty chart handling | ⚠️ Basic | Chart renders empty when history < 2 entries |
| Props / PropTypes | ⚠️ Partial | Inline components (`StatCard`, `CapabilityCard`) typed via `React.FC`; no prop validation |

## Configuration Files

| File | Purpose |
|------|---------|
| `vite.config.ts` | Vite plugin config; `base: './'` for static hosting |
| `tailwind.config.cjs` | Custom color extensions + content paths |
| `tsconfig.json` | Project references to app + node configs |
| `tsconfig.app.json` | App TypeScript: ES2023 target, React JSX, strict lint options |
| `tsconfig.node.json` | Node/script TypeScript (Vite types) |
| `eslint.config.js` | ESLint with `@eslint/js`, `typescript-eslint`, `react-hooks`, `react-refresh` |
| `.gitignore` | Comprehensive exclusions (node_modules, dist, env files, OS artifacts) |

## Package Scripts (`package.json`)

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "lint": "eslint .",
    "preview": "vite preview"
  }
}
```

## Environment Variables

None defined in-production. To add API configurability, consider adding:

- `VITE_API_BASE` — overrides `http://localhost:19456` (Vite exposes `import.meta.env.VITE_*`)

If added, update `App.tsx`:

```ts
const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:19456';
```

## Static Assets

- `public/favicon.svg` — browser tab icon
- `public/icons.svg` — SVG sprite set (unused)
- `public/lulu.svg` — Lulu brand mark
- `src/assets/hero.png`, `react.svg`, `vite.svg` — unused in current code

## Recent Changes (May 2, 2026)

1. Created `CLAUDE.md` with future-agent instructions
2. Updated `.gitignore` to comprehensive Vite + TS + pnpm coverage
3. Updated `README.md` with full project documentation
4. Created `docs/` directory: `API.md`, `ARCHITECTURE.md`, `STYLE_GUIDE.md`
5. Snapshot of current implementation for reference

## Next Steps (Optional Improvements)

- Add Vitest + React Testing Library; write smoke tests for each tab
- Implement WebSocket reconnection with exponential backoff
- Introduce React Query for REST caching / use `useSWR`
- Make `API_BASE` configurable via `VITE_API_BASE` env var
- Add loading skeletons to all data cards while fetching
- Show "Connection lost" alert when WebSocket closes unexpectedly
- Extract `App.tsx` into component modules once file exceeds ~500 LOC
- Add TypeScript interface files for all API response types in `src/types/`
