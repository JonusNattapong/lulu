/**
 * Daemon Tools — Tools exposed by the persistent agent daemon.
 * Used in agent prompts to enable daemon interaction.
 */
import { personalAgentDaemon } from "../../core/daemon.js";
import { userProfile } from "../../core/user-profile.js";
import { skillProposalManager } from "../../core/skill-proposal.js";
import { proactiveEngine } from "../../core/proactive.js";
import type { Tool } from "../registry.js";

export const daemonTools: Tool[] = [
  {
    name: "daemon_status",
    category: "daemon",
    description: "Check if the personal agent daemon is running and get its status.",
    risk: "low",
    input_schema: { type: "object", properties: {}, required: [] },
    execute: async () => {
      const status = personalAgentDaemon.getStatus();
      return `Daemon ${status.pid ? "running" : "stopped"}\nUptime: ${status.uptime}s\nSessions: ${status.sessions}\nTurns: ${status.turns}\nMemory: ${status.memoryUsage}MB\nActive agents: ${status.activeAgents}\nPending proposals: ${status.pendingProposals}\nActive suggestions: ${status.activeSuggestions}`;
    }
  },
  {
    name: "daemon_learn_preference",
    category: "daemon",
    description: "Record a learned preference about the user based on behavior or feedback.",
    risk: "low",
    input_schema: {
      type: "object",
      properties: {
        key: { type: "string", description: "Preference key (e.g., 'codeStyle', 'verbosity')" },
        value: { type: "string", description: "Preference value" },
        context: { type: "string", description: "Context where this preference was observed" },
        confidence: { type: "number", description: "Confidence level 0-1" }
      },
      required: ["key", "value", "context"]
    },
    execute: async (input: any) => {
      userProfile.recordPreference(input.key, input.value, input.context, "pattern", input.confidence || 0.7);
      return `Learned: ${input.key} = ${input.value}`;
    }
  },
  {
    name: "daemon_propose_skill",
    category: "daemon",
    description: "Propose a new skill from a workflow analysis.",
    risk: "low",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Skill name" },
        description: { type: "string", description: "Skill description" },
        category: { type: "string", description: "Category" },
        triggers: { type: "array", items: { type: "string" }, description: "Trigger phrases" },
        steps: { type: "string", description: "Step-by-step workflow" }
      },
      required: ["name", "description", "triggers", "steps"]
    },
    execute: async (input: any) => {
      const id = skillProposalManager.propose(input);
      proactiveEngine.suggest({
        type: "recommendation",
        title: "Skill proposed",
        body: `Created proposal "${input.name}". Run /proposals to review.`,
        context: `skill:${input.name}`,
        priority: "low"
      });
      return `Skill proposal "${input.name}" created (ID: ${id})`;
    }
  },
  {
    name: "daemon_remember",
    category: "daemon",
    description: "Store a persistent fact about the user or project.",
    risk: "low",
    input_schema: {
      type: "object",
      properties: {
        key: { type: "string", description: "Fact key" },
        value: { type: "string", description: "Fact value" }
      },
      required: ["key", "value"]
    },
    execute: async (input: any) => {
      personalAgentDaemon.remember(input.key, input.value);
      return `Remembered: ${input.key} = ${input.value}`;
    }
  },
  {
    name: "daemon_recall",
    category: "daemon",
    description: "Recall a persistent fact about the user or project.",
    risk: "low",
    input_schema: {
      type: "object",
      properties: { key: { type: "string", description: "Fact key to recall" } },
      required: ["key"]
    },
    execute: async (input: any) => {
      const value = personalAgentDaemon.recall(input.key);
      return value ? `${input.key}: ${value}` : `No fact for key: ${input.key}`;
    }
  },
  {
    name: "daemon_suggest",
    category: "daemon",
    description: "Send a proactive suggestion to the user.",
    risk: "low",
    input_schema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["reminder", "recommendation", "pattern", "warning"], description: "Suggestion type" },
        title: { type: "string", description: "Suggestion title" },
        body: { type: "string", description: "Suggestion body" },
        priority: { type: "string", enum: ["low", "medium", "high"], description: "Priority" }
      },
      required: ["title", "body"]
    },
    execute: async (input: any) => {
      proactiveEngine.suggest({
        type: input.type || "recommendation",
        title: input.title,
        body: input.body,
        context: "tool",
        priority: input.priority || "medium"
      });
      return `Suggestion "${input.title}" created`;
    }
  },
  {
    name: "daemon_list_suggestions",
    category: "daemon",
    description: "List active proactive suggestions.",
    risk: "low",
    input_schema: { type: "object", properties: {}, required: [] },
    execute: async () => {
      const suggestions = proactiveEngine.list();
      return suggestions.length > 0
        ? suggestions.map((s: any) => `[${s.priority}] ${s.title}: ${s.body}`).join("\n")
        : "No active suggestions";
    }
  },
  {
    name: "daemon_dismiss_suggestion",
    category: "daemon",
    description: "Dismiss a proactive suggestion.",
    risk: "low",
    input_schema: { type: "object", properties: { id: { type: "string", description: "Suggestion ID" } }, required: ["id"] },
    execute: async (input: any) => {
      proactiveEngine.dismiss(input.id);
      return `Dismissed suggestion ${input.id}`;
    }
  }
];