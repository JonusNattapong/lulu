import type { MessageParam } from "@anthropic-ai/sdk/resources/index.js";
import type { AgentConfig } from "../types/types.js";
import { runAgent as runCoreAgent } from "./agent.js";

export type AgentKind = "assistant" | "planner" | "worker" | "critic" | "router";

export interface AgentDefinition {
  id: string;
  name: string;
  kind: AgentKind;
  description?: string;
  systemPrompt?: string;
  provider?: AgentConfig["provider"];
  model?: string;
  maxTokens?: number;
  tools?: string[];
  skills?: string[];
  metadata?: Record<string, unknown>;
}

export interface AgentRunInput {
  prompt: string;
  config: AgentConfig;
  history?: MessageParam[];
  onToken?: (token: string) => void;
  metadata?: Record<string, unknown>;
}

export interface AgentRunResult {
  agentId: string;
  text: string;
  messages: MessageParam[];
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    costEstimate: number;
  };
  metadata?: Record<string, unknown>;
}

export interface AgentRuntime {
  name: string;
  canRun(agent: AgentDefinition): boolean;
  run(agent: AgentDefinition, input: AgentRunInput): Promise<AgentRunResult>;
}

export class CoreAgentRuntime implements AgentRuntime {
  readonly name = "core-agent-runtime";

  canRun(): boolean {
    return true;
  }

  async run(agent: AgentDefinition, input: AgentRunInput): Promise<AgentRunResult> {
    const config = this.buildConfig(agent, input.config);
    const result = await runCoreAgent(
      config,
      input.prompt,
      input.history || [],
      input.onToken,
    );

    return {
      agentId: agent.id,
      text: result.finalText,
      messages: result.messages,
      usage: result.usage,
      metadata: {
        runtime: this.name,
        kind: agent.kind,
        ...(agent.metadata || {}),
        ...(input.metadata || {}),
      },
    };
  }

  private buildConfig(agent: AgentDefinition, baseConfig: AgentConfig): AgentConfig {
    const systemPrompt = agent.systemPrompt
      ? `${baseConfig.systemPrompt}\n\n[Agent: ${agent.name}]\n${agent.systemPrompt}`
      : baseConfig.systemPrompt;

    return {
      ...baseConfig,
      provider: agent.provider || baseConfig.provider,
      model: agent.model || baseConfig.model,
      maxTokens: agent.maxTokens || baseConfig.maxTokens,
      systemPrompt,
    };
  }
}

export class AgentFramework {
  private readonly agents = new Map<string, AgentDefinition>();
  private readonly runtimes: AgentRuntime[] = [];

  constructor(runtimes: AgentRuntime[] = [new CoreAgentRuntime()]) {
    for (const runtime of runtimes) this.registerRuntime(runtime);
  }

  registerAgent(agent: AgentDefinition): AgentDefinition {
    if (!agent.id.trim()) throw new Error("Agent id is required");
    if (!agent.name.trim()) throw new Error("Agent name is required");
    this.agents.set(agent.id, { ...agent });
    return agent;
  }

  getAgent(id: string): AgentDefinition | null {
    const agent = this.agents.get(id);
    return agent ? { ...agent } : null;
  }

  listAgents(): AgentDefinition[] {
    return Array.from(this.agents.values()).map((agent) => ({ ...agent }));
  }

  registerRuntime(runtime: AgentRuntime): void {
    this.runtimes.push(runtime);
  }

  async run(agentId: string, input: AgentRunInput): Promise<AgentRunResult> {
    const agent = this.agents.get(agentId);
    if (!agent) throw new Error(`Agent not found: ${agentId}`);

    const runtime = this.runtimes.find((candidate) => candidate.canRun(agent));
    if (!runtime) throw new Error(`No runtime can run agent: ${agentId}`);

    return runtime.run(agent, input);
  }
}

export const luluAgentFramework = new AgentFramework();

luluAgentFramework.registerAgent({
  id: "lulu",
  name: "Lulu",
  kind: "assistant",
  description: "Default local personal AI agent with SOUL, skills, memory, tools, and gateway sessions.",
});
