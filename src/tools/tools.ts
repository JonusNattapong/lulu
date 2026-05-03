import type { ToolDef, ToolCall, ToolResult, AgentConfig } from "../types/types.js";
import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { homedir } from "os";
import path from "path";
import { registry } from "./registry.js";
import { policyEngine } from "../core/policy.js";
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
import { schedulerTools } from "./modules/scheduler.js";
import { skillTools } from "./modules/skill.js";
import { curationTools } from "./modules/curation.js";
import { subagentTools } from "./modules/subagent.js";
import { trajectoryTools } from "./modules/trajectory.js";
import { executionTools } from "./modules/execution.js";
import { coordinatorTools } from "./modules/coordinator.js";
import { daemonTools } from "./modules/daemon-tools.js";

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
  ...systemTools,
  ...schedulerTools,
  ...skillTools,
  ...curationTools,
  ...subagentTools,
  ...trajectoryTools,
  ...executionTools,
  ...coordinatorTools,
  ...daemonTools,
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

export function syncPreferencesToGlobalSoul(profile: { preferences: Array<{ key: string; value: string }> }): void {
  const lines = ["# PREFERENCES\n\nLearned user preferences synced from Lulu.\n"];
  for (const p of profile.preferences.slice(-30)) {
    lines.push(`- **${redact(p.key)}**: ${redact(p.value)}`);
  }
  // @ts-ignore
  writeGlobalSoulFile("PREFERENCES.md", lines.join("\n"));
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
      // Security Check for Plugins
      const policy = policyEngine.checkPermission({
        toolName: plugin.name,
        risk: "medium", // Assume medium risk for unknown plugins
        channel: config.channel || "cli",
        input: call.input
      });

      if (!policy.allowed) {
        return { tool_use_id: call.id, content: `Access Denied for Plugin: ${policy.reason}`, is_error: true };
      }

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
