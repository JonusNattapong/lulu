# Architectural Decisions (ADR)

### 1. Why `ink`?
We chose React-based `ink` for the CLI over raw `readline` or `blessed` because it allows declarative UI state management. Complex flows like "Switch Provider -> Fetch Models -> Display Searchable List" are infinitely easier to manage with React Hooks (`useState`, `useEffect`).

### 2. Provider API Fallbacks
Instead of hard-failing when an API is unreachable or a JWT is invalid, Lulu uses a "resilient fallback" strategy. It attempts to fetch models dynamically via `/models` endpoints, but silently catches failures and returns a curated list of hardcoded defaults to ensure the developer flow is never blocked.
