import type { MessageParam } from "@anthropic-ai/sdk/resources/index.js";
import type { AgentConfig, SubAgent, SubAgentResult, SubAgentStatus } from "../types/types.js";
import { eventBus } from "./events.js";
import { loadPlugins, executeTool, getPluginTools, BUILTIN_TOOLS, getPlugins } from "../tools/tools.js";
import { sendToProviderStream, toolResultToClaudeMessage, type Usage } from "../providers/providers.js";
import { loadMCPServers, getMCPTools, callMCPTool, closeAllMCP } from "./mcp.js";

const DEFAULT_MAX_ROUNDS = 10;

interface SubAgentEntry {
  id: string;
  name: string;
  status: SubAgentStatus;
  parentId: string;
  prompt: string;
  config: AgentConfig;
  maxRounds: number;
  abortController: AbortController;
  result?: SubAgentResult;
  error?: string;
  createdAt: string;
  startedAt?: string;
  endedAt?: string;
  promise?: Promise<SubAgentResult>;
}

class SubAgentManager {
  private agents = new Map<string, SubAgentEntry>();

  /**
   * Spawn an isolated child agent. Runs asynchronously — use collect() or wait_for_agents to get results.
   */
  async spawn(options: {
    parentId: string;
    name?: string;
    prompt: string;
    config: AgentConfig;
    maxRounds?: number;
    timeout?: number;
  }): Promise<string> {
    const id = `subagent-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const entry: SubAgentEntry = {
      id,
      name: options.name || `agent-${id}`,
      status: "pending",
      parentId: options.parentId,
      prompt: options.prompt,
      config: { ...options.config },
      maxRounds: options.maxRounds ?? DEFAULT_MAX_ROUNDS,
      abortController: new AbortController(),
      createdAt: new Date().toISOString(),
    };

    this.agents.set(id, entry);
    eventBus.emit("subagent:start", { id: entry.id, name: entry.name, prompt: entry.prompt }, id);

    // Run async, non-blocking
    entry.promise = this.runEntry(entry, options.timeout);
    return id;
  }

  private async runEntry(entry: SubAgentEntry, timeoutMs?: number): Promise<SubAgentResult> {
    const timeout = timeoutMs ?? 120_000;
    const timer = setTimeout(() => {
      entry.abortController.abort();
    }, timeout);

    try {
      entry.status = "running";
      entry.startedAt = new Date().toISOString();
      const result = await this.runAgentLoop(entry);
      entry.result = result;
      entry.status = "done";
      entry.endedAt = new Date().toISOString();
      eventBus.emit("subagent:end", { id: entry.id, result }, entry.id);
      return result;
    } catch (err: any) {
      entry.error = err.message || String(err);
      entry.status = "failed";
      entry.endedAt = new Date().toISOString();
      eventBus.emit("subagent:end", { id: entry.id, error: entry.error }, entry.id);
      return {
        id: entry.id,
        text: entry.error || "Unknown error",
        messages: [],
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, costEstimate: 0 },
      };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Inner agent loop — extracted from runAgent so sub-agents can reuse it directly.
   * Uses a dedicated session context, no shared history.
   */
  private async runAgentLoop(entry: SubAgentEntry): Promise<SubAgentResult> {
    const { prompt, config, maxRounds, abortController } = entry;

    await loadPlugins();
    const mcpServers = (config as any).mcpServers || [];
    await loadMCPServers(mcpServers);

    const tools = [
      ...BUILTIN_TOOLS,
      ...getPluginTools(),
      ...getMCPTools(),
    ];

    let messages: MessageParam[] = [
      { role: "user", content: prompt }
    ];

    let totalUsage: Usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0, costEstimate: 0 };
    let rounds = 0;

    while (rounds < maxRounds) {
      if (abortController.signal.aborted) {
        entry.status = "aborted";
        break;
      }

      rounds++;
      let fullText = "";
      let toolCalls: any[] = [];
      let usage: Usage | undefined;

      const stream = sendToProviderStream(config, messages, tools);

      for await (const event of stream) {
        if (abortController.signal.aborted) break;

        if (event.type === "text_delta") {
          fullText += event.text;
          eventBus.emit("subagent:token", { id: entry.id, text: event.text }, entry.id);
        } else if (event.type === "tool_use") {
          toolCalls = event.toolCalls || [];
        } else if (event.type === "usage" && event.usage) {
          usage = event.usage;
          totalUsage.inputTokens += usage.inputTokens;
          totalUsage.outputTokens += usage.outputTokens;
          totalUsage.totalTokens += usage.totalTokens;
          totalUsage.costEstimate += usage.costEstimate;
        }
      }

      if (abortController.signal.aborted) break;

      messages.push({ role: "assistant", content: fullText || "Thinking..." });

      if (toolCalls.length === 0) break;

      const results = [];
      for (const call of toolCalls) {
        eventBus.emit("subagent:tool:start", { id: entry.id, name: call.name, input: call.input }, entry.id);
        let result;
        if (call.name.startsWith("mcp_")) {
          result = await callMCPTool(call.name, call.input);
          result = { ...result, tool_use_id: call.id };
        } else {
          result = await executeTool(call, config);
        }
        results.push(result);
        eventBus.emit("subagent:tool:end", { id: entry.id, name: call.name }, entry.id);
      }

      messages.push(toolResultToClaudeMessage(results));
    }

    closeAllMCP();

    return {
      id: entry.id,
      text: (messages[messages.length - 1]?.content as string) || "",
      messages,
      usage: totalUsage,
    };
  }

  /**
   * Wait for specific agents to complete and collect their results.
   */
  async collect(agentIds: string[], timeoutMs?: number): Promise<Map<string, SubAgentResult>> {
    const timeout = timeoutMs ?? 300_000;
    const deadline = Date.now() + timeout;
    const results = new Map<string, SubAgentResult>();

    const pending = agentIds
      .map(id => this.agents.get(id))
      .filter((e): e is SubAgentEntry => e !== undefined)
      .filter(e => e.status !== "done" && e.status !== "failed" && e.status !== "aborted");

    await Promise.all(pending.map(async (entry) => {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        entry.abortController.abort();
        return;
      }
      const result = await Promise.race([
        entry.promise!,
        new Promise<SubAgentResult>(r => setTimeout(() => r({
          id: entry.id,
          text: "Timeout waiting for agent",
          messages: [],
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, costEstimate: 0 },
        }), remaining)),
      ]);
      results.set(entry.id, result);
    }));

    return results;
  }

  /**
   * Cancel a running sub-agent.
   */
  abort(id: string): boolean {
    const entry = this.agents.get(id);
    if (!entry) return false;
    entry.abortController.abort();
    return true;
  }

  /**
   * Get status of a sub-agent.
   */
  getStatus(id: string): SubAgent | null {
    const entry = this.agents.get(id);
    if (!entry) return null;
    return {
      id: entry.id,
      name: entry.name,
      status: entry.status,
      parentId: entry.parentId,
      prompt: entry.prompt,
      config: entry.config,
      createdAt: entry.createdAt,
      startedAt: entry.startedAt,
      endedAt: entry.endedAt,
      error: entry.error,
    };
  }

  /**
   * List all active sub-agents.
   */
  list(): SubAgent[] {
    return Array.from(this.agents.values()).map(entry => ({
      id: entry.id,
      name: entry.name,
      status: entry.status,
      parentId: entry.parentId,
      prompt: entry.prompt,
      config: entry.config,
      createdAt: entry.createdAt,
      startedAt: entry.startedAt,
      endedAt: entry.endedAt,
      error: entry.error,
    }));
  }

  /**
   * Clean up completed agents older than maxAgeMs.
   */
  prune(maxAgeMs = 3_600_000): void {
    const cutoff = Date.now() - maxAgeMs;
    for (const [id, entry] of this.agents) {
      if (entry.endedAt && new Date(entry.endedAt).getTime() < cutoff) {
        this.agents.delete(id);
      }
    }
  }
}

export const subAgentManager = new SubAgentManager();
