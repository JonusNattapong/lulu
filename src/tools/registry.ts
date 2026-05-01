import type { ToolCall, ToolResult, AgentConfig, ToolDef } from "../types/types.js";
import { policyEngine } from "../core/policy.js";

export type RiskLevel = "low" | "medium" | "high";

export interface Tool {
  name: string;
  description: string;
  category: string;
  input_schema: any;
  permissions?: string[];
  risk?: RiskLevel;
  enabled?: boolean;
  execute: (input: any, config: AgentConfig) => Promise<string>;
}

class ToolRegistry {
  private tools: Map<string, Tool> = new Map();

  register(tool: Tool) {
    if (tool.enabled === false) return;
    this.tools.set(tool.name, tool);
  }

  getTool(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  getAllTools(): Tool[] {
    return Array.from(this.tools.values());
  }

  getToolDefs(): ToolDef[] {
    return this.getAllTools().map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema
    }));
  }

  async execute(call: ToolCall, config: AgentConfig): Promise<ToolResult> {
    const tool = this.tools.get(call.name);
    if (!tool) {
      return { tool_use_id: call.id, content: `Tool not found: ${call.name}`, is_error: true };
    }

    try {
      // Centralized Policy Check
      const policy = policyEngine.checkPermission({
        toolName: tool.name,
        risk: tool.risk || "low",
        channel: config.channel || "cli",
        input: call.input
      });

      if (!policy.allowed) {
        return { tool_use_id: call.id, content: `Access Denied: ${policy.reason}`, is_error: true };
      }

      if (policy.needsApproval) {
        // Approval logic could be interactive in CLI or async in API
        // For now, we simulate approval in CLI or fail in others if not approved
        if (config.channel === "cli") {
          // TODO: Implement interactive approval
          // For now, allow but log
          console.error(`[Policy] High-risk action approved by default in CLI: ${tool.name}`);
        } else {
          return { tool_use_id: call.id, content: `Approval Required: ${policy.reason}. This tool cannot be run automatically from ${config.channel}.`, is_error: true };
        }
      }

      const result = await tool.execute(call.input, config);
      return { tool_use_id: call.id, content: result };
    } catch (err: any) {
      return { tool_use_id: call.id, content: err.message || String(err), is_error: true };
    }
  }
}

export const registry = new ToolRegistry();
