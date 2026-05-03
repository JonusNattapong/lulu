# Built-in Tools

Lulu operates as an Agent by invoking Tools. Tools allow the Large Language Model to break out of the text-generation sandbox and interact directly with your system.

## Available Tools

### 1. File System Tools
- **Read File:** Allows Lulu to read any file's contents into context.
- **List Directory:** Allows Lulu to explore project structures.
- **Write/Replace Content:** Allows Lulu to generate code, refactor functions, or update `.env` files.

### 2. Terminal Tools
- **Run Command:** Lulu can execute `bash` or `powershell` commands. This is useful for compiling code, running tests (`npm run test`), or starting servers.

### 3. Browser Tools
- **Browser Sub-agent:** Spawns a headless browser to search the web, read documentation sites, or scrape data when Lulu needs up-to-date information not found in its training data.
