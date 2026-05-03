import Anthropic from "@anthropic-ai/sdk";
import { pipeline } from "@xenova/transformers";
import type { ToolDef, ToolCall, ToolResult, AgentConfig, ModelProvider } from "../types/types.js";

// Re-export for convenience
export type { ToolDef, ToolCall, ToolResult };

// --- Local Embedding Model (all-MiniLM-L6-v2) ---
let extractor: any = null;

async function getExtractor() {
  if (!extractor) {
    extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  return extractor;
}

export async function getEmbedding(_config: AgentConfig, text: string): Promise<EmbeddingResponse> {
  const extract = await getExtractor();
  const output = await extract(text, { pooling: 'mean', normalize: true });
  const embedding = Array.from(output.data) as number[];
  
  return {
    embedding,
    usage: { totalTokens: 0 } // Local, so no token cost
  };
}

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

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costEstimate: number;
}

export interface AgentResponse {
  text: string;
  toolCalls: ToolCall[];
  stopReason: string;
  usage: Usage;
}

export interface EmbeddingResponse {
  embedding: number[];
  usage: { totalTokens: number };
}

export interface StreamEvent {
  type: "text_delta" | "text_end" | "tool_use" | "usage";
  text?: string;
  toolCalls?: ToolCall[];
  stopReason?: string;
  usage?: Usage;
}

export function calculateCost(model: string, input: number, output: number): number {
  const rates: Record<string, { in: number, out: number }> = {
    "claude-3-5-sonnet-20241022": { in: 3, out: 15 },
    "claude-3-5-haiku-20241022": { in: 0.25, out: 1.25 },
    "gpt-4o": { in: 2.5, out: 10 },
    "gpt-4o-mini": { in: 0.15, out: 0.6 },
    "deepseek-chat": { in: 0.14, out: 0.28 },
  };

  const rate = rates[model] || { in: 0, out: 0 };
  return (input * rate.in + output * rate.out) / 1_000_000;
}

export async function* sendToProviderStream(
  config: AgentConfig,
  messages: Anthropic.MessageParam[],
  tools: ToolDef[],
): AsyncGenerator<StreamEvent> {
  switch (config.provider) {
    case "claude":
      yield* streamClaude(config, messages, tools);
      return;
    case "openrouter":
    case "deepseek":
    case "mistral":
    case "google":
    case "openai":
    case "kilocode":
    case "opencode":
    case "cline":
    case "copilot":
      yield* streamOpenAICompatible(config, messages, tools);
      return;
    default:
      throw new Error(`Provider ${config.provider} is not supported yet.`);
  }
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
    case "google":
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

async function* streamClaude(
  config: AgentConfig,
  messages: Anthropic.MessageParam[],
  tools: ToolDef[],
): AsyncGenerator<StreamEvent> {
  const client = new Anthropic({ apiKey: config.apiKey });
  let fullText = "";
  let toolCalls: ToolCall[] = [];
  let stopReason = "end_turn";

  const stream = await client.messages.create({
    model: config.model,
    max_tokens: config.maxTokens,
    system: config.systemPrompt,
    messages,
    tools: toolsToAnthropic(tools),
    stream: true,
  });

  const toolCallAccum: Map<number, { id: string; name: string; input: string }> = new Map();

  for await (const chunk of stream) {
    switch (chunk.type) {
      case "content_block_delta":
        if (chunk.delta.type === "text_delta") {
          fullText += chunk.delta.text;
          yield { type: "text_delta", text: chunk.delta.text };
        } else if (chunk.delta.type === "input_json_delta") {
          const idx = (chunk as any).index ?? 0;
          const entry = toolCallAccum.get(idx);
          if (entry) entry.input += chunk.delta.partial_json;
        }
        break;
      case "content_block_start":
        if (chunk.content_block.type === "tool_use") {
          const idx = (chunk as any).index ?? 0;
          toolCallAccum.set(idx, {
            id: chunk.content_block.id,
            name: chunk.content_block.name,
            input: "",
          });
        }
        break;
      case "message_delta":
        if (chunk.delta.stop_reason) stopReason = chunk.delta.stop_reason;
        break;
      case "message_start":
        if (chunk.message.usage) {
          yield {
            type: "usage",
            usage: {
              inputTokens: chunk.message.usage.input_tokens,
              outputTokens: chunk.message.usage.output_tokens,
              totalTokens: chunk.message.usage.input_tokens + chunk.message.usage.output_tokens,
              costEstimate: calculateCost(config.model, chunk.message.usage.input_tokens, chunk.message.usage.output_tokens)
            }
          };
        }
        break;
    }
  }

  yield { type: "text_end", text: fullText };

  for (const [, acc] of toolCallAccum) {
    toolCalls.push({
      id: acc.id,
      name: acc.name,
      input: JSON.parse(acc.input || "{}"),
    });
  }

  if (toolCalls.length > 0) {
    yield { type: "tool_use", toolCalls, stopReason };
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
    usage: {
      inputTokens: resp.usage.input_tokens,
      outputTokens: resp.usage.output_tokens,
      totalTokens: resp.usage.input_tokens + resp.usage.output_tokens,
      costEstimate: calculateCost(config.model, resp.usage.input_tokens, resp.usage.output_tokens)
    }
  };
}

async function sendToOpenAICompatible(
  config: AgentConfig,
  messages: Anthropic.MessageParam[],
  tools: ToolDef[],
): Promise<AgentResponse> {
  const baseUrl = getBaseUrl(config.provider);
  
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
    stopReason: choice.finish_reason,
    usage: {
      inputTokens: data.usage.prompt_tokens,
      outputTokens: data.usage.completion_tokens,
      totalTokens: data.usage.total_tokens,
      costEstimate: calculateCost(config.model, data.usage.prompt_tokens, data.usage.completion_tokens)
    }
  };
}

async function* streamOpenAICompatible(
  config: AgentConfig,
  messages: Anthropic.MessageParam[],
  tools: ToolDef[],
): AsyncGenerator<StreamEvent> {
  const baseUrl = getBaseUrl(config.provider);

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
      stream: true,
      stream_options: { include_usage: true },
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI-compatible provider error (${response.status}): ${error}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body for streaming");

  const decoder = new TextDecoder();
  let fullText = "";
  const toolCallAccum: Map<number, { id: string; name: string; args: string }> = new Map();
  let buffer = "";
  let finalUsage: Usage | undefined;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data: ")) continue;
      const jsonStr = trimmed.slice(6);
      if (jsonStr === "[DONE]") continue;

      try {
        const chunk = JSON.parse(jsonStr);
        
        if (chunk.usage) {
          finalUsage = {
            inputTokens: chunk.usage.prompt_tokens,
            outputTokens: chunk.usage.completion_tokens,
            totalTokens: chunk.usage.total_tokens,
            costEstimate: calculateCost(config.model, chunk.usage.prompt_tokens, chunk.usage.completion_tokens)
          };
          continue;
        }

        const choice = chunk.choices?.[0];
        const delta = choice?.delta;
        if (!delta) continue;

        if (delta.content) {
          fullText += delta.content;
          yield { type: "text_delta", text: delta.content };
        }

        // Accumulate tool calls
        const tcDeltas = delta.tool_calls;
        if (tcDeltas) {
          for (const tc of tcDeltas) {
            const idx = tc.index ?? 0;
            if (!toolCallAccum.has(idx)) {
              toolCallAccum.set(idx, {
                id: tc.id ?? "",
                name: tc.function?.name ?? "",
                args: "",
              });
            }
            const entry = toolCallAccum.get(idx)!;
            if (tc.id) entry.id = tc.id;
            if (tc.function?.name) entry.name = tc.function.name;
            if (tc.function?.arguments) entry.args += tc.function.arguments;
          }
        }
      } catch {
        // Skip malformed chunks
      }
    }
  }

  yield { type: "text_end", text: fullText };

  if (finalUsage) {
    yield { type: "usage", usage: finalUsage };
  }

  const toolCalls: ToolCall[] = [];
  for (const [, acc] of toolCallAccum) {
    try {
      toolCalls.push({
        id: acc.id,
        name: acc.name,
        input: JSON.parse(acc.args),
      });
    } catch {
      // Skip unparseable tool calls
    }
  }

  if (toolCalls.length > 0) {
    yield { type: "tool_use", toolCalls, stopReason: "tool_calls" };
  }
}

export function getBaseUrl(provider: ModelProvider): string {
  switch (provider) {
    case "openrouter": return process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";
    case "deepseek": return process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";
    case "mistral": return process.env.MISTRAL_BASE_URL || "https://api.mistral.ai/v1";
    case "openai": return process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
    case "google": return process.env.GOOGLE_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/openai";
    case "kilocode": return process.env.KILOCODE_BASE_URL || "https://api.kilo.ai/api/gateway";
    case "opencode": return process.env.OPENCODE_BASE_URL || "https://api.opencode.com/v1";
    case "cline": return process.env.CLINE_BASE_URL || "https://api.cline.ai/v1";
    case "copilot": return process.env.COPILOT_BASE_URL || "https://api.github.com/copilot/chat"; 
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
