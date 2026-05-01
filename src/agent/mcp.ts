import { spawn } from "node:child_process";
import type { ToolDef, ToolCall, ToolResult, MCPServer } from "../types.js";

export interface MCPTool {
  server: string;
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface MCPClient {
  name: string;
  tools: MCPTool[];
  callTool(toolName: string, args: Record<string, unknown>): Promise<ToolResult>;
  close(): void;
}

let clients: Map<string, MCPClient> = new Map();

export async function loadMCPServers(servers: MCPServer[]): Promise<void> {
  clients.clear();
  
  for (const server of servers) {
    try {
      const client = await createMCPClient(server);
      clients.set(server.name, client);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[MCP] Failed to load ${server.name}: ${msg}`);
    }
  }
}

async function createMCPClient(server: MCPServer): Promise<MCPClient> {
  if (server.transport === "http" && server.url) {
    return createHTTPClient(server);
  }
  return createStdioClient(server);
}

async function createStdioClient(server: MCPServer): Promise<MCPClient> {
  const proc = spawn(server.command!, server.args ?? [], {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, ...server.env },
  }) as any;

  let tools: MCPTool[] = [];

  const request = async (method: string, params?: Record<string, unknown>): Promise<unknown> => {
    return new Promise((resolve, reject) => {
      const id = Math.random().toString(36).slice(2);
      const msg = JSON.stringify({ jsonrpc: "2.0", id, method, params });
      
      let buffer = "";
      const onData = (data: Buffer) => {
        buffer += data.toString();
        let newlineIdx;
        while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, newlineIdx);
          buffer = buffer.slice(newlineIdx + 1);
          try {
            const resp = JSON.parse(line);
            if (resp.id === id) {
              if (resp.error) reject(new Error(resp.error.message));
              else resolve(resp.result);
            }
          } catch {}
        }
      };

      proc.stdout?.on("data", onData);
      proc.stderr?.on("data", (d: Buffer) => console.error(`[MCP ${server.name}]`, d.toString()));
      
      proc.stdin?.write(msg + "\n");
      
      setTimeout(() => reject(new Error("MCP request timeout")), 30000);
    });
  };

  try {
    const resp = await request("tools/list") as { tools: Array<{ name: string; description: string; inputSchema: unknown }> };
    tools = resp.tools.map((t) => ({
      server: server.name,
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema as MCPTool["input_schema"],
    }));
  } catch (err) {
    proc.kill();
    throw err;
  }

  return {
    name: server.name,
    tools,
    async callTool(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
      try {
        const result = await request("tools/call", { name: toolName, arguments: args });
        return { tool_use_id: "", content: JSON.stringify(result) };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { tool_use_id: "", content: `MCP error: ${msg}`, is_error: true };
      }
    },
    close() {
      proc.kill();
    },
  };
}

async function createHTTPClient(server: MCPServer): Promise<MCPClient> {
  const baseUrl = server.url!;

  const request = async (method: string, params?: Record<string, unknown>): Promise<unknown> => {
    const resp = await fetch(baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: "1", method, params }),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
    const data = await resp.json() as { error?: { message: string }; result?: unknown };
    if (data.error) throw new Error(data.error.message);
    return data.result;
  };

  const resp = await request("tools/list") as { tools: Array<{ name: string; description: string; inputSchema: unknown }> };
  const tools: MCPTool[] = resp.tools.map((t) => ({
    server: server.name,
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema as MCPTool["input_schema"],
  }));

  return {
    name: server.name,
    tools,
    async callTool(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
      try {
        const result = await request("tools/call", { name: toolName, arguments: args });
        return { tool_use_id: "", content: JSON.stringify(result) };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { tool_use_id: "", content: `MCP error: ${msg}`, is_error: true };
      }
    },
    close() {},
  };
}

export function getMCPTools(): ToolDef[] {
  const toolDefs: ToolDef[] = [];
  for (const [serverName, client] of clients) {
    for (const tool of client.tools) {
      toolDefs.push({
        name: `mcp_${serverName}_${tool.name}`,
        description: `[MCP:${serverName}] ${tool.description}`,
        input_schema: tool.input_schema,
      });
    }
  }
  return toolDefs;
}

export async function callMCPTool(fullName: string, input: Record<string, unknown>): Promise<ToolResult> {
  const match = fullName.match(/^mcp_(.+?)_(.+)$/);
  if (!match) return { tool_use_id: "", content: "Invalid MCP tool name", is_error: true };

  const [, serverName, toolName] = match;
  const client = clients.get(serverName);
  if (!client) return { tool_use_id: "", content: `MCP server not found: ${serverName}`, is_error: true };

  return client.callTool(toolName, input);
}

export function closeAllMCP(): void {
  for (const client of clients.values()) {
    client.close();
  }
  clients.clear();
}

export async function addMCPServer(server: MCPServer): Promise<void> {
  const client = await createMCPClient(server);
  clients.set(server.name, client);
}

export function getMCPServersLoaded(): { name: string; tools: number }[] {
  return Array.from(clients.entries()).map(([name, client]) => ({
    name,
    tools: client.tools.length,
  }));
}