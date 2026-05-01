---
name: mcp
description: Connect Lulu to Model Context Protocol servers to use tools from external apps (Databases, Slack, GitHub, etc.). Use when user wants to integrate with external services.
---

# MCP (Model Context Protocol)

Connect Lulu to MCP servers to bring external app capabilities.

## What is MCP?

MCP is a protocol that lets AI tools connect to external services. Instead of writing custom integrations, you can just configure an MCP server and use its tools directly in Lulu.

## MCP Server Config

Config files (loaded in order, later overrides):

1. `~/.lulu/mcp-servers.json` (global)
2. `./.lulu-mcp.json` (project-local)

## Config Format

```json
[
  {
    "name": "server-name",
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/dir"],
    "env": { "KEY": "value" }
  }
]
```

Or HTTP transport:

```json
[
  {
    "name": "http-server",
    "transport": "http",
    "url": "http://localhost:3000/mcp"
  }
]
```

## Common MCP Servers

| Server | Install | Use Case |
|--------|---------|----------|
| `filesystem` | `npx -y @modelcontextprotocol/server-filesystem /path` | File operations |
| `github` | `npx -y @modelcontextprotocol/server-github` | GitHub API |
| `sqlite` | `npx -y @modelcontextprotocol/server-sqlite` | Database queries |
| `brave-search` | `npx -y @modelcontextprotocol/server-brave-search` | Web search |
| `fetch` | `npx -y @modelcontextprotocol/server-fetch` | HTTP requests |

## Example Usage

1. Create `.lulu-mcp.json`:
```json
[
  {
    "name": "files",
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-filesystem", "."]
  }
]
```

2. Run Lulu — MCP tools are auto-loaded:
```
lulu> List files in the current directory
```

## Tool Naming

MCP tools are prefixed with `mcp_serverName_toolName`:
- `mcp_files_read_file`
- `mcp_github_create_issue`

## Troubleshooting

- Server fails to start: Check command/path is correct
- Tools not loading: Check server logs in stderr
- Timeout: MCP requests have 30s timeout