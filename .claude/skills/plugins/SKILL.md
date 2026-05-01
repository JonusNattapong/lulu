---
name: plugins
description: Create and manage Lulu plugins. Use when building custom tools, integrating external APIs, or extending Lulu with new capabilities.
---

# Plugin System

Lulu plugins let you add custom tools without modifying the core.

## Plugin Directory

```
~/.lulu/plugins/
```

## Plugin Formats

### Format 1: Directory-based (recommended)

```
~/.lulu/plugins/
└── plugin-slack/
    ├── lulu-plugin.json    # Manifest
    └── index.js            # ES module
```

**lulu-plugin.json:**
```json
{
  "name": "slack",
  "version": "0.1.0",
  "description": "Send messages to Slack",
  "author": "Me",
  "permissions": ["network:slack.com"]
}
```

**index.js:**
```js
export default {
  name: "send_slack_message",
  description: "Send a message to a Slack channel",
  input_schema: {
    type: "object",
    properties: {
      channel: { type: "string", description: "Channel ID" },
      message: { type: "string", description: "Message text" }
    },
    required: ["channel", "message"]
  },
  async execute(input, config) {
    const token = process.env.SLACK_TOKEN;
    const resp = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ channel: input.channel, text: input.message })
    });
    const data = await resp.json();
    return data.ok ? "Message sent!" : "Failed: " + JSON.stringify(data);
  }
};
```

### Format 2: Single-file plugin

```
~/.lulu/plugins/my-tool.js
```

Same structure as `index.js` above, just as a single file.

## Plugin API

```ts
interface Plugin {
  name: string;           // Tool name (e.g., "send_slack_message")
  description: string;    // What it does
  input_schema: object;   // JSON Schema for inputs
  execute(input, config): Promise<string>;  // Main function
  permissions?: string[]; // Optional permission tags
}
```

## Plugin Permissions

| Permission | Allows |
|-----------|--------|
| `network` | Any outbound HTTP request |
| `network:domain.com` | Only requests to domain.com |
| `filesystem:read` | Read any file |
| `filesystem:write` | Write any file |
| `env:VAR_NAME` | Read specific env var |
| `shell` | Run shell commands |

## Auto-Reload

Plugins are reloaded on each conversation turn. No server restart needed.

## Example Plugins

- **Slack**: Send messages, list channels, post reactions
- **Google Sheets**: Read/write spreadsheet cells
- **Linear**: Create issues, list projects
- **Weather**: Fetch current weather for location
- **Database**: Run SQL queries via connection string
