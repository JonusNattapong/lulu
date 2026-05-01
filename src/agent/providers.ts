import Anthropic from "@anthropic-ai/sdk";
import type { ToolDef, ToolCall, ToolResult, AgentConfig, ModelProvider } from "../types.js";

// Re-export for convenience
export type { ToolDef, ToolCall, ToolResult };

// --- Anthropic / Claude ---

function toolsToAnthropic(
  tools: ToolDef[],
): Anthropic.Tool[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema as Anthropic.Tool.InputSchema,
  }));
}

export interface AgentResponse {
  text: string;
  toolCalls: ToolCall[];
  stopReason: string;
}

export async function sendToProvider(
  config: AgentConfig,
  messages: Anthropic.MessageParam[],
  tools: ToolDef[],
): Promise<AgentResponse> {
  switch (config.provider) {
    case "claude":
      return sendToClaude(config, messages, tools);
    case "openrouter":
    case "deepseek":
    case "mistral":
    case "openai":
    case "kilocode":
    case "opencode":
    case "cline":
    case "copilot":
      return sendToOpenAICompatible(config, messages, tools);
    default:
      throw new Error(`Provider ${config.provider} is not supported yet.`);
  }
}

async function sendToClaude(
  config: AgentConfig,
  messages: Anthropic.MessageParam[],
  tools: ToolDef[],
): Promise<AgentResponse> {
  const client = new Anthropic({ apiKey: config.apiKey });

  const resp = await client.messages.create({
    model: config.model,
    max_tokens: config.maxTokens,
    system: config.systemPrompt,
    messages,
    tools: toolsToAnthropic(tools),
  });

  const textBlocks: string[] = [];
  const toolCalls: ToolCall[] = [];

  for (const block of resp.content) {
    switch (block.type) {
      case "text":
        textBlocks.push(block.text);
        break;
      case "tool_use":
        toolCalls.push({
          id: block.id,
          name: block.name,
          input: block.input as Record<string, unknown>,
        });
        break;
    }
  }

  return {
    text: textBlocks.join("\n"),
    toolCalls,
    stopReason: resp.stop_reason ?? "end_turn",
  };
}

async function sendToOpenAICompatible(
  config: AgentConfig,
  messages: Anthropic.MessageParam[],
  tools: ToolDef[],
): Promise<AgentResponse> {
  const baseUrl = getBaseUrl(config.provider);
  
  // Convert Anthropic messages to OpenAI format
  const openAIMessages = messages.map(m => ({
    role: m.role,
    content: Array.isArray(m.content) 
      ? m.content.map(c => c.type === 'text' ? c.text : JSON.stringify(c)).join('\n')
      : m.content
  }));

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: config.systemPrompt },
        ...openAIMessages
      ],
      tools: tools.map(t => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.input_schema
        }
      })),
      max_tokens: config.maxTokens,
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI-compatible provider error (${response.status}): ${error}`);
  }

  const data = await response.json() as any;
  const choice = data.choices[0];
  const message = choice.message;

  const toolCalls: ToolCall[] = (message.tool_calls || []).map((tc: any) => ({
    id: tc.id,
    name: tc.function.name,
    input: JSON.parse(tc.function.arguments)
  }));

  return {
    text: message.content || "",
    toolCalls,
    stopReason: choice.finish_reason
  };
}

function getBaseUrl(provider: ModelProvider): string {
  switch (provider) {
    case "openrouter": return "https://openrouter.ai/api/v1";
    case "deepseek": return "https://api.deepseek.com";
    case "mistral": return "https://api.mistral.ai/v1";
    case "openai": return "https://api.openai.com/v1";
    case "kilocode": return "https://api.kilocode.com/v1";
    case "opencode": return "https://api.opencode.com/v1";
    case "cline": return "https://api.cline.ai/v1";
    case "copilot": return "https://api.github.com/copilot/chat"; // GitHub Copilot is different, but this is a placeholder
    default: return "";
  }
}


export function toolResultToClaudeMessage(
  results: ToolResult[],
): Anthropic.MessageParam {
  return {
    role: "user",
    content: results.map((r) => ({
      type: "tool_result" as const,
      tool_use_id: r.tool_use_id,
      content: r.content,
      is_error: r.is_error,
    })),
  };
}

export function toolCallToClaudeMessage(
  calls: ToolCall[],
): Anthropic.MessageParam {
  return {
    role: "assistant",
    content: calls.map((c) => ({
      type: "tool_use" as const,
      id: c.id,
      name: c.name,
      input: c.input,
    })),
  };
}
