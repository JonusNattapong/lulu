import {
  type AgentConfig,
  type ToolResult,
} from "../types.js";
import {
  sendToProvider,
  toolResultToClaudeMessage,
  toolCallToClaudeMessage,
} from "./providers.js";
import { BUILTIN_TOOLS, executeTool } from "./tools.js";
import type { MessageParam } from "@anthropic-ai/sdk/resources/index.js";

const MAX_TOOL_ROUNDS = 10;

export async function runAgent(
  config: AgentConfig,
  userMessage: string,
  context: MessageParam[] = [],
): Promise<{ messages: MessageParam[]; finalText: string }> {
  const messages: MessageParam[] = [
    ...context,
    { role: "user" as const, content: userMessage },
  ];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const resp = await sendToProvider(
      config,
      messages,
      BUILTIN_TOOLS,
    );

    // If model stops with just text, we're done
    if (resp.toolCalls.length === 0) {
      if (resp.text) {
        messages.push({ role: "assistant" as const, content: resp.text });
      }
      return { messages, finalText: resp.text };
    }

    // Execute all tool calls in this round
    const results: ToolResult[] = resp.toolCalls.map(executeTool);

    // Record the tool calls and results in message history
    messages.push(toolCallToClaudeMessage(resp.toolCalls));
    messages.push(toolResultToClaudeMessage(results));

    // Stream text if any (partial response before tool use)
    if (resp.text) {
      process.stdout.write(resp.text + "\n");
    }
  }

  return {
    messages,
    finalText: "(max tool rounds reached)",
  };
}
