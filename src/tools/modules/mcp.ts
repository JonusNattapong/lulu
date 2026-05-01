import { addMCPServer, getMCPServersLoaded } from "../../core/mcp.js";
import type { Tool } from "../registry.js";

export const mcpTools: Tool[] = [
  {
    name: "list_mcp_servers",
    category: "mcp",
    description: "List all currently loaded MCP servers.",
    risk: "low",
    input_schema: { type: "object", properties: {} },
    execute: async () => {
      const servers = getMCPServersLoaded();
      if (servers.length === 0) return "No MCP servers loaded.";
      return "Loaded MCP Servers:\n" + servers.map(s => `- ${s.name} (${s.tools} tools)`).join("\n");
    }
  },
  {
    name: "add_mcp_server",
    category: "mcp",
    description: "Dynamically add and start a new MCP server.",
    risk: "medium",
    permissions: ["command"],
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        command: { type: "string" },
        args: { type: "array", items: { "type": "string" } },
        env: { type: "object" }
      },
      required: ["name", "command"]
    },
    execute: async (input) => {
      await addMCPServer(input);
      return `Successfully added MCP server: ${input.name}`;
    }
  }
];
