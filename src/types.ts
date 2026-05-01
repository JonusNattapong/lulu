import type { MessageParam } from "@anthropic-ai/sdk/resources/index.js";

export interface ToolDef {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResult {
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

export type ModelProvider =
  | "claude"
  | "openai"
  | "google"
  | "kilocode"
  | "opencode"
  | "openrouter"
  | "cline"
  | "mistral"
  | "copilot"
  | "deepseek";

export interface AgentConfig {
  provider: ModelProvider;
  model: string;
  apiKey: string;
  systemPrompt: string;
  maxTokens: number;
}
