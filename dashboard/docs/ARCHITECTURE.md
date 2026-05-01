# Architecture

## Overview

The dashboard is a single-page React application with a single root component (`App.tsx`) that manages all state and rendering. It uses a hybrid data-fetching strategy: REST polling for periodic data refresh combined with a WebSocket for real-time chat streaming.

## Component Tree

```
App (root)
├── Header
│   ├── Logo + Title
│   └── Tab Navigation (6 buttons)
├── Tab Views (conditional render)
│   ├── Overview
│   │   ├── StatCard × 4 grid
│   │   ├── AreaChart (tokens over time)
│   │   └── MCP Terminal List
│   ├── Chat
│   │   ├── Stream Output (pre block)
│   │   └── Prompt Input (input + button)
│   ├── Memory
│   │   └── Memory Content (monospace block)
│   ├── Ecosystem
│   │   ├── MCP Servers cards
│   │   └── Plugins cards
│   ├── Capabilities
│   │   └── CapabilityCard × N grid
│   └── History
│       └── Message Bubbles (user + assistant)
└── Stream Output (bottom) — shown when chat active
```

All components except `StatCard` and `CapabilityCard` are inline in `App.tsx`.

## Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│  App.tsx (mount)                                           │
│    ├─ useEffect(polling) ──▶ fetchData() ──▶ REST /status │
│    │                          ├─▶ /history                │
│    │                          ├─▶ /memory                 │
│    │                          ├─▶ /mcp                    │
│    │                          ├─▶ /plugins                │
│    │                          └─▶ /capabilities           │
│    │                                                         │
│    └─ useEffect(websocket) ──▶ WS /ws ──▶ session_start   │
│                                   ├─▶ stream_token         │
│                                   ├─▶ session_end          │
│                                   └─▶ error                │
│                                                             │
│  State updates ──▶ re-render via AnimatePresence           │
└─────────────────────────────────────────────────────────────┘
```

### Polling Pattern

```ts
useEffect(() => {
  fetchData();
  const interval = setInterval(fetchData, 5000);
  return () => clearInterval(interval);
}, []);
```

- Fires immediately on mount, then every 5 seconds
- `fetchData()` uses `Promise.all` to parallel-fetch 6 endpoints
- Updates individual state setters (`setStatus`, `setHistory`, etc.)
- Graceful degradation: `/capabilities` has `.catch(() => null)` so dashboard works even if that endpoint is missing

### WebSocket Pattern

```ts
useEffect(() => {
  const ws = new WebSocket(`ws://localhost:19456/ws`);
  wsRef.current = ws;

  ws.onmessage = (event) => {
    const { type, data } = JSON.parse(event.data);
    switch (type) {
      case "session_start": setStreamSession(data.sessionId); setStreamText(''); setIsLoading(true); break;
      case "stream_token": setStreamText(prev => prev + data.token); break;
      case "session_end": setIsLoading(false); fetchData(); break;
      case "error": setIsLoading(false); setStreamText(prev => prev + `\n\nError: ${data.message}`); break;
    }
  };

  return () => ws.close();
}, []);
```

- Single long-lived connection per page lifetime
- Only sends when user clicks "Send" or presses Enter
- No reconnection logic — relies on page refresh

## State Shape

```ts
// Core data (from REST)
status: { status: string; provider: string; model: string; projectName: string; version: string } | null
memory: string
history: Array<{ timestamp?: string; prompt?: string; userMessage?: string; finalText?: string; usage?: { inputTokens: number; outputTokens: number; totalTokens: number; costEstimate: number } }>
mcp: Array<{ name: string; tools: number }>
plugins: Array<{ name: string; description: string }>
capabilities: any | null  // system detection object

// Chat state (from WebSocket)
streamText: string
streamSession: string
promptInput: string
isLoading: boolean

// UI state
activeTab: 'overview' | 'chat' | 'memory' | 'ecosystem' | 'capabilities' | 'history'
```

## Rendering Strategy

- **Tabs** — Conditional blocks with `<AnimatePresence mode="wait">` wrapping six `{activeTab === 'x' && ...}` expressions
- **Tab animation** — Each tab block is a `<motion.div>` with `key={tabName}`, initial/animate/exit variants for fade+slide
- **Charts** — Recharts `AreaChart` renders last 10 history entries (slice(-10))
- **Lists** — `.map()` over arrays with empty-state fallbacks
- **Glassmorphism** — `.glass` class provides semi-transparent slate panels; `.card-hover` adds hover elevation

## API Contract Assumptions

The dashboard assumes the backend API follows the Moltbot gateway convention of returning JSON with these field names. If the backend schema diverges, update the TypeScript interfaces at the top of `App.tsx` (lines 31–48) and adjust data mapping in `fetchData()` (lines 57–76).

## Styling Layer

- **Tailwind** — v4 with `@tailwind` directives in `index.css` (imported in `main.tsx`)
- **Custom utilities**:
  - `.glass` — `background: rgba(30, 41, 59, 0.7); backdrop-filter: blur(12px); border: 1px solid rgba(255,255,255,0.1)`
  - `.card-hover` — hover lift + cyan border transition
- **Theme colors** — `tailwind.config.cjs extends colors with `background: "#0f172a"` and `glass`
- **Color palette** — Slate-900 base, cyan-500 primary, purple-400 secondary (capabilities), pink-400 tertiary (plugins)

## Vite Configuration

```ts
// vite.config.ts
export default defineConfig({
  base: './',           // for static hosting (relative asset paths)
  plugins: [react()],   // no SSR, no SWC
});
```

No alias, no environment plugin, no custom resolve. Everything bundled via Vite dev server.

## Future Scaling Considerations

If the app grows beyond a single-file component:

- Extract into `src/components/`:
  - `StatCard.tsx`
  - `CapabilityCard.tsx`
  - `OverviewTab.tsx`
  - `ChatInterface.tsx`
  - `MemoryView.tsx`
  - `EcosystemTab.tsx` (MCP + Plugins split)
  - `HistoryTab.tsx`
  - `Header.tsx`

- Add feature flags to hide tabs not relevant to certain deployments

- Move WebSocket into a custom hook (`useLuluChat`) or context provider

- Consider React Query or SWR for intelligent caching / stale-while-revalidate

- If more APIs emerge, group them by domain into service modules (`src/services/api.ts`)
