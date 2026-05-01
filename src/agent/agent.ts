import {
  type AgentConfig,
  type ToolResult,
} from "../types.js";
import {
  sendToProviderStream,
  toolResultToClaudeMessage,
  toolCallToClaudeMessage,
} from "./providers.js";
import { BUILTIN_TOOLS, executeTool } from "./tools.js";
import type { MessageParam } from "@anthropic-ai/sdk/resources/index.js";
import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

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
    const stream = sendToProviderStream(
      config,
      messages,
      BUILTIN_TOOLS,
    );

    let text = "";
    let toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];

    for await (const event of stream) {
      switch (event.type) {
        case "text_end":
          text = event.text ?? "";
          break;
        case "tool_use":
          toolCalls = event.toolCalls ?? [];
          break;
      }
    }

    // If model stops with just text, we're done
    if (toolCalls.length === 0) {
      if (text) {
        messages.push({ role: "assistant" as const, content: text });
        process.stdout.write("\n");
      }
      return { messages, finalText: "" };
    }

    // Execute all tool calls in this round
    const results: ToolResult[] = toolCalls.map(tc => executeTool(tc, config));

    // Record the tool calls and results in message history
    messages.push(toolCallToClaudeMessage(toolCalls));
    messages.push(toolResultToClaudeMessage(results));
  }

  // Log the final state of this turn as JSON
  try {
    const logDir = path.join(homedir(), ".lulu");
    if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true });
    const logPath = path.join(logDir, "history.jsonl");
    const logEntry = {
      timestamp: new Date().toISOString(),
      project: config.projectName,
      messages: messages.slice(-2), // Log the last exchange
    };
    appendFileSync(logPath, JSON.stringify(logEntry) + "\n", "utf-8");
  } catch {
    // Ignore logging errors
  }

  return {
    messages,
    finalText: "(max tool rounds reached)",
  };
}
