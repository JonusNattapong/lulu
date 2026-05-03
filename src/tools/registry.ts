import type { ToolCall, ToolResult, AgentConfig, ToolDef } from "../types/types.js";
import { policyEngine } from "../core/policy.js";
import path from "node:path";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { APPROVAL_CONFIG } from "../core/paths.js";
import readline from "node:readline/promises";

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

export interface ApprovalRequest {
  tool: string;
  input: any;
  reason: string;
  timestamp: string;
  status: "pending" | "approved" | "denied";
}

export interface ApprovalConfig {
  enabled: boolean;
  autoApproveLowRisk: boolean;
  requireConfirmation: boolean;
  approvalMode: "cli" | "config" | "disabled";
  allowedCommands: string[];
}

class ToolRegistry {
  private tools: Map<string, Tool> = new Map();
  private approvalRequests: Map<string, ApprovalRequest> = new Map();
  private config: ApprovalConfig;

  constructor() {
    this.config = this.loadApprovalConfig();
  }

  private loadApprovalConfig(): ApprovalConfig {
    const configPath = APPROVAL_CONFIG;
    const defaults: ApprovalConfig = {
      enabled: true,
      autoApproveLowRisk: true,
      requireConfirmation: true,
      approvalMode: "cli",
      allowedCommands: [],
    };

    if (!existsSync(configPath)) {
      return defaults;
    }

    try {
      const raw = readFileSync(configPath, "utf-8");
      return { ...defaults, ...JSON.parse(raw) };
    } catch {
      return defaults;
    }
  }

  private saveApprovalConfig(): void {
    const configPath = APPROVAL_CONFIG;
    const dir = path.dirname(configPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(configPath, JSON.stringify(this.config, null, 2));
  }

  async requestApproval(request: ApprovalRequest): Promise<boolean> {
    if (!this.config.enabled) return true;
    if (this.config.approvalMode === "disabled") return true;

    const id = `approval-${Date.now()}`;

    // Store approval request
    this.approvalRequests.set(id, request);

    if (this.config.approvalMode === "config") {
      // Check against allowed commands
      if (this.config.allowedCommands.includes(request.tool)) {
        request.status = "approved";
        return true;
      }
      return false;
    }

    // CLI mode - interactive approval
    if (this.config.approvalMode === "cli" && this.config.requireConfirmation) {
      console.log("\n⚠️  Approval Required");
      console.log(`Tool: ${request.tool}`);
      console.log(`Reason: ${request.reason}`);
      console.log("\nInput preview:");
      console.log(JSON.stringify(request.input, null, 2).slice(0, 500));

      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      try {
        const answer = await rl.question("\nAllow? (y/n/a/q): ");
        rl.close();

        switch (answer.toLowerCase()) {
          case "y":
          case "yes":
            request.status = "approved";
            return true;
          case "n":
          case "no":
            request.status = "denied";
            return false;
          case "a":
          case "always":
            request.status = "approved";
            this.config.allowedCommands.push(request.tool);
            this.saveApprovalConfig();
            console.log(`✅ Auto-approved ${request.tool} for future calls`);
            return true;
          case "q":
          case "quit":
            request.status = "denied";
            return false;
          default:
            return false;
        }
      } catch {
        rl.close();
        return false;
      }
    }

    return true;
  }

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
        const approved = await this.requestApproval({
          tool: tool.name,
          input: call.input,
          reason: policy.reason || "High-risk action requires approval",
          timestamp: new Date().toISOString(),
          status: "pending",
        });

        if (!approved) {
          return {
            tool_use_id: call.id,
            content: `Approval denied for ${tool.name}. Action was not executed.`,
            is_error: true,
          };
        }
      }

      const result = await tool.execute(call.input, config);
      return { tool_use_id: call.id, content: result };
    } catch (err: any) {
      return { tool_use_id: call.id, content: err.message || String(err), is_error: true };
    }
  }

  // Configuration methods
  setApprovalMode(mode: "cli" | "config" | "disabled"): void {
    this.config.approvalMode = mode;
    this.saveApprovalConfig();
  }

  addAllowedCommand(toolName: string): void {
    if (!this.config.allowedCommands.includes(toolName)) {
      this.config.allowedCommands.push(toolName);
      this.saveApprovalConfig();
    }
  }

  removeAllowedCommand(toolName: string): void {
    this.config.allowedCommands = this.config.allowedCommands.filter(c => c !== toolName);
    this.saveApprovalConfig();
  }

  getPendingApprovals(): ApprovalRequest[] {
    return Array.from(this.approvalRequests.values()).filter(r => r.status === "pending");
  }

  setAutoApproveLowRisk(enabled: boolean): void {
    this.config.autoApproveLowRisk = enabled;
    this.saveApprovalConfig();
  }

  getConfig(): ApprovalConfig {
    return { ...this.config };
  }
}

export const registry = new ToolRegistry();