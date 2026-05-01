# Dashboard API Reference

## Backend Endpoints

The dashboard communicates with the Moltbot gateway on `http://localhost:19456`. All requests use HTTP GET via Axios.

### GET /status

Agent status summary.

**Response:**
```json
{
  "status": "online",
  "provider": "kilocode",
  "model": "claude-3-5-sonnet-20241022",
  "projectName": "luluai",
  "version": "0.0.5"
}
```

**Display:** Overview tab — provider badge, model name, project name, version tag.

---

### GET /history

Conversation history with token usage.

**Response:**
```json
[
  {
    "timestamp": "2026-05-01T19:08:41.433Z",
    "projectName": "luluai",
    "prompt": "say hi",
    "finalText": "Hi there! 👋 How can I help you today?",
    "usage": {
      "inputTokens": 9102,
      "outputTokens": 132,
      "totalTokens": 9234,
      "costEstimate": 0.00131124
    }
  }
]
```

**Display:**
- Overview tab — last 10 sessions shown as area chart (token counts over time)
- History tab — all sessions as message bubbles with token badge

---

### GET /memory

Project knowledge base / memory contents.

**Response:**
```json
{
  "content": "string containing stored project context and facts..."
}
```

**Display:** Memory tab — monospace text block, scrollable.

---

### GET /mcp

List of active Model Context Protocol (MCP) servers.

**Response:**
```json
[
  {
    "name": "filesystem",
    "tools": 12
  }
]
```

**Display:**
- Overview tab — terminal-style list with green dot indicator and tool count badge
- Ecosystem tab — card per server with description

---

### GET /plugins

Custom plugins registered with the agent.

**Response:**
```json
[
  {
    "name": "github-pr",
    "description": "Fetch and summarize PRs from GitHub"
  }
]
```

**Display:** Ecosystem tab — card per plugin with name and description.

---

### GET /capabilities

System capability detection results.

**Response:**
```json
{
  "git": { "available": true, "path": "C:\\Program Files\\Git\\mingw64\\bin\\git.EXE" },
  "tmux": false,
  "bun": { "available": true, "version": "1.2.0" },
  "node": { "available": true, "version": "24.3.0", "path": "C:\\Program Files\\nodejs\\node.EXE" },
  "browser": { "available": true, "type": "chrome" },
  "network": { "available": true },
  "os": {
    "platform": "windows",
    "isWindows": true,
    "isMacOS": false,
    "isLinux": false,
    "arch": "x64"
  },
  "shell": {
    "bash": true,
    "zsh": false,
    "powershell": true,
    "cmd": true
  }
}
```

**Display:** Capabilities tab — grid of check/cross icons with platform-specific details.

---

## WebSocket: ws://localhost:19456/ws

Real-time streaming chat interface.

**Connection:**
```ts
const ws = new WebSocket('ws://localhost:19456/ws');
```

**Messages sent (client → server):**
```json
{ "type": "prompt", "data": { "prompt": "user message", "context": [] } }
```

**Messages received (server → client):**

| Type | Data | Meaning |
|------|------|---------|
| `connected` | `{}` | Websocket handshake complete |
| `session_start` | `{ sessionId: string }` | New conversation session began |
| `stream_token` | `{ token: string }` | One token of response text |
| `session_end` | `{}` | Agent finished responding |
| `error` | `{ message: string }` | Something went wrong |

**Implementation:** See `App.tsx` lines 91–124 (WebSocket setup), 126–135 (send logic), 96–120 (message switch).

---

## Error Handling

- **REST fetch failure** — Logged to console, data fields show empty/zero states
- **WebSocket error** → displays error in stream output
- **Backend offline** → UI shows "..." loading states and empty charts

## Data Refresh Behavior

- **REST endpoints** — Polled every 5 seconds via `setInterval` (see `useEffect` at line 78)
- **WebSocket streaming** — Long-lived connection per page session
- **History refresh** — Re-fetched automatically after `session_end` event
