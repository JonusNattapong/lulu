import type { RiskLevel } from "../tools/registry.js";

export type Channel = "cli" | "api" | "telegram" | "dashboard" | "subagent" | "system";

export interface PermissionRequest {
  toolName: string;
  risk: RiskLevel;
  channel: Channel;
  input: any;
}

export interface PermissionResult {
  allowed: boolean;
  needsApproval: boolean;
  reason?: string;
}

export class PolicyEngine {
  private static instance: PolicyEngine;

  private constructor() {}

  static getInstance(): PolicyEngine {
    if (!PolicyEngine.instance) {
      PolicyEngine.instance = new PolicyEngine();
    }
    return PolicyEngine.instance;
  }

  checkPermission(request: PermissionRequest): PermissionResult {
    const { toolName, risk, channel } = request;

    // 1. Hard-coded Safety Rules (Global)
    if (toolName === "filesystem_delete" && channel !== "cli") {
      // Whitelist check could go here
      return { allowed: false, needsApproval: false, reason: `Deletion not allowed via ${channel} for security reasons.` };
    }

    // 2. Risk-based Policy
    switch (channel) {
      case "cli":
        if (risk === "high") {
          return { allowed: true, needsApproval: true, reason: "High-risk action requires manual approval." };
        }
        return { allowed: true, needsApproval: false };

      case "api":
      case "dashboard":
      case "telegram":
        if (risk === "high") {
          return { allowed: false, needsApproval: false, reason: `High-risk actions are disabled on ${channel}.` };
        }
        if (risk === "medium") {
          return { allowed: true, needsApproval: true, reason: `Medium-risk action via ${channel} requires approval.` };
        }
        return { allowed: true, needsApproval: false };

      default:
        return { allowed: false, needsApproval: false, reason: "Unknown channel policy." };
    }
  }
}

export const policyEngine = PolicyEngine.getInstance();
