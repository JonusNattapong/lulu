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

export interface MCPServer {
  name: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  transport?: "stdio" | "http";
  url?: string;
}

export interface AgentConfig {
  provider: ModelProvider;
  model: string;
  apiKey: string;
  systemPrompt: string;
  maxTokens: number;
  projectName?: string;
  projectRoot?: string;
  mcpServers?: MCPServer[];
  channel?: "cli" | "api" | "telegram" | "dashboard" | "system";
}
