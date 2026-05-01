import type { ToolDef, ToolCall, ToolResult, AgentConfig } from "../types/types.js";
import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { homedir } from "os";
import path from "path";
import { registry } from "./registry.js";
import { redact, redactObject } from "../core/secrets.js";

// Import modules
import { filesystemTools } from "./modules/filesystem.js";
import { shellTools } from "./modules/shell.js";
import { webTools } from "./modules/web.js";
import { agentTools } from "./modules/agent.js";
import { taskTools } from "./modules/tasks.js";
import { promptTools } from "./modules/prompt.js";
import { mcpTools } from "./modules/mcp.js";
import { gitTools } from "./modules/git.js";
import { systemTools } from "./modules/system.js";

// Register all tools
[
  ...filesystemTools,
  ...shellTools,
  ...webTools,
  ...agentTools,
  ...taskTools,
  ...promptTools,
  ...mcpTools,
  ...gitTools,
  ...systemTools
].forEach(tool => registry.register(tool));

export const BUILTIN_TOOLS: ToolDef[] = registry.getToolDefs();

export interface Plugin {
  name: string;
  version?: string;
  description: string;
  input_schema: any;
  permissions?: string[];
  execute: (input: any, config: AgentConfig) => Promise<string>;
}

const PLUGINS: Map<string, Plugin> = new Map();

export async function loadPlugins(): Promise<void> {
  const pluginDir = path.join(homedir(), ".lulu", "plugins");
  if (!existsSync(pluginDir)) return;
  PLUGINS.clear();
  const entries = readdirSync(pluginDir);
  for (const entry of entries) {
    const fullPath = path.join(pluginDir, entry);
    try {
      if (statSync(fullPath).isDirectory()) {
        const manifestPath = path.join(fullPath, "lulu-plugin.json");
        if (existsSync(manifestPath)) {
          const indexJs = path.join(fullPath, "index.js");
          if (existsSync(indexJs)) {
            const mod = await import(`file://${indexJs}?t=${Date.now()}`);
            if (mod.default) PLUGINS.set(mod.default.name, mod.default);
          }
        }
        continue;
      }
      if (entry.endsWith('.js')) {
        const mod = await import(`file://${fullPath}?t=${Date.now()}`);
        if (mod.default) PLUGINS.set(mod.default.name, mod.default);
      }
    } catch (err) { console.error(`[Plugin] Failed to load ${entry}:`, err); }
  }
}

export function getPluginTools(): ToolDef[] {
  return Array.from(PLUGINS.values()).map(p => ({
    name: p.name,
    description: `[Plugin] ${p.description}`,
    input_schema: p.input_schema
  }));
}

export function getPlugins(): Plugin[] {
  return Array.from(PLUGINS.values());
}

export async function executeTool(call: ToolCall, config: AgentConfig): Promise<ToolResult> {
  const plugin = PLUGINS.get(call.name);
  if (plugin) {
    try {
      const result = await plugin.execute(call.input, config);
      return { tool_use_id: call.id, content: redact(result) };
    } catch (err: any) {
      return { tool_use_id: call.id, content: redact(err.message), is_error: true };
    }
  }
  const result = await registry.execute(call, config);
  if (result.content) {
    result.content = redact(result.content);
  }
  return result;
}
