import type { Tool } from "../registry.js";
import { subAgentManager } from "../../core/subagent.js";
import type { SubAgentResult } from "../../types/types.js";
import type { AgentConfig } from "../../types/types.js";
import { redact } from "../../core/secrets.js";

export const subagentTools: Tool[] = [
  {
    name: "spawn_agent",
    category: "agent",
    description: "Spawn an isolated child agent to perform a task in parallel. Returns the agent ID immediately so the parent can do other work.",
    risk: "medium",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Optional name for this sub-agent." },
        prompt: { type: "string", description: "The task description for the sub-agent." },
        max_rounds: { type: "number", description: "Max tool-call rounds for the sub-agent. Default: 10." },
        timeout: { type: "number", description: "Timeout in milliseconds. Default: 120000." },
      },
      required: ["prompt"]
    },
    execute: async (input, config) => {
      const parentId = (config as any).sessionId || `parent-${Date.now()}`;
      const id = await subAgentManager.spawn({
        parentId,
        name: input.name,
        prompt: input.prompt,
        config,
        maxRounds: input.max_rounds ?? 10,
        timeout: input.timeout ?? 120000,
      });
      return `Sub-agent spawned: ${id}\nName: ${input.name || id}\nUse wait_for_agents with this ID to collect the result.`;
    }
  },
  {
    name: "wait_for_agents",
    category: "agent",
    description: "Wait for spawned sub-agents to complete and collect their results.",
    risk: "low",
    input_schema: {
      type: "object",
      properties: {
        agent_ids: {
          type: "array",
          items: { type: "string" },
          description: "List of agent IDs returned by spawn_agent."
        },
        timeout: { type: "number", description: "Total wait timeout in milliseconds. Default: 300000." }
      },
      required: ["agent_ids"]
    },
    execute: async (input, config) => {
      const agentIds = input.agent_ids as string[];
      const timeout = input.timeout ?? 300000;

      const results = await subAgentManager.collect(agentIds, timeout);

      const lines: string[] = [];
      for (const [id, result] of results) {
        const status = subAgentManager.getStatus(id);
        if (status?.status === "failed" || status?.status === "aborted") {
          lines.push(`Agent ${id} (${status.name || id}): ${status.status} — ${status.error || "unknown error"}`);
          continue;
        }
        const summary = result.text.length > 1000 ? result.text.slice(0, 1000) + "\n... (truncated)" : result.text;
        lines.push(`Agent ${id} (${status?.name || id}):`);
        lines.push(redact(summary));
        lines.push(`Tokens used: ${result.usage.totalTokens}`);
      }

      if (lines.length === 0) {
        return "No results collected.";
      }

      return lines.join("\n");
    }
  },
  {
    name: "agent_status",
    category: "agent",
    description: "Get the status of a spawned sub-agent by its ID.",
    risk: "low",
    input_schema: {
      type: "object",
      properties: {
        agent_id: { type: "string", description: "The agent ID returned by spawn_agent." }
      },
      required: ["agent_id"]
    },
    execute: async (input, _config) => {
      const entry = subAgentManager.getStatus(input.agent_id);
      if (!entry) return `Agent not found: ${input.agent_id}`;

      return [
        `Agent: ${entry.id}`,
        `Name: ${entry.name}`,
        `Status: ${entry.status}`,
        `Parent: ${entry.parentId}`,
        `Created: ${entry.createdAt}`,
        entry.startedAt ? `Started: ${entry.startedAt}` : "",
        entry.endedAt ? `Ended: ${entry.endedAt}` : "",
        entry.error ? `Error: ${entry.error}` : "",
        `Prompt: ${entry.prompt}`,
      ].filter(Boolean).join("\n");
    }
  },
  {
    name: "list_agents",
    category: "agent",
    description: "List all active sub-agents.",
    risk: "low",
    input_schema: {
      type: "object",
      properties: {},
    },
    execute: async (_input, _config) => {
      const agents = subAgentManager.list();
      if (agents.length === 0) return "No active sub-agents.";

      return agents.map(a => `${a.id} | ${a.name} | ${a.status}`).join("\n");
    }
  },
  {
    name: "abort_agent",
    category: "agent",
    description: "Abort a running sub-agent.",
    risk: "medium",
    input_schema: {
      type: "object",
      properties: {
        agent_id: { type: "string", description: "The agent ID to abort." }
      },
      required: ["agent_id"]
    },
    execute: async (input, _config) => {
      const ok = subAgentManager.abort(input.agent_id);
      return ok
        ? `Agent ${input.agent_id} abort signalled.`
        : `Agent not found: ${input.agent_id}`;
    }
  },
];
