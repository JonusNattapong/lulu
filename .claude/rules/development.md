# Development Guidelines

- **TypeScript:** Strict mode is enabled. Do not use `any`. Use `interface` for object shapes.
- **ESM:** Use ES Modules. Always include `.js` extension in imports (e.g., `import { x } from "./utils.js"`).
- **Functional Programming:** Prefer pure functions, immutability, and explicit data flow.
- **Async/Await:** Use `async/await` instead of raw promises or callbacks.
