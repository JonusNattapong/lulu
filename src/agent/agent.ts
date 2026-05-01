import {
  type AgentConfig,
  type ToolResult,
} from "../types.js";
import {
  sendToProviderStream,
  toolResultToClaudeMessage,
  toolCallToClaudeMessage,
  type Usage,
} from "./providers.js";
import { BUILTIN_TOOLS, executeTool } from "./tools.js";
import { loadMCPServers, getMCPTools, callMCPTool, closeAllMCP } from "./mcp.js";
import type { MessageParam } from "@anthropic-ai/sdk/resources/index.js";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

import pc from "picocolors";

const MAX_TOOL_ROUNDS = 10;
const MAX_HISTORY_MESSAGES = 12; // Start summarizing when history gets long

async function summarizeHistory(config: AgentConfig, messages: MessageParam[]): Promise<MessageParam> {
  const summaryPrompt = "Please summarize the preceding conversation into a concise paragraph, preserving all key decisions, file names mentioned, and task progress. This summary will be used as context for the next turn.";
  
  const stream = sendToProviderStream(config, [
    ...messages,
    { role: "user", content: summaryPrompt }
  ], []);

  let summary = "";
  for await (const event of stream) {
    if (event.type === "text_end") summary = event.text ?? "";
  }

  return {
    role: "user",
    content: `[Conversation Summary of previous turns]: ${summary}`
  };
}

async function reflectAndStore(config: AgentConfig, messages: MessageParam[]) {
  const reflectionPrompt = "Reflect on the task just completed. If you learned something new about this project's architecture, patterns, or specific setup, please output a single-paragraph summary starting with 'MEMORY UPDATE: '. If nothing significant changed, output 'NO UPDATE'.";
  
  const stream = sendToProviderStream(config, [
    ...messages,
    { role: "user", content: reflectionPrompt }
  ], []);

  let reflection = "";
  for await (const event of stream) {
    if (event.type === "text_end") reflection = event.text ?? "";
  }

  if (reflection.startsWith("MEMORY UPDATE:")) {
    const memoryText = reflection.replace("MEMORY UPDATE:", "").trim();
    // Update memory.json internally (simplified)
    const memoryPath = path.join(homedir(), ".lulu", "projects", `${config.projectName}.json`);
    let memory = { notes: [] as string[] };
    try {
      if (existsSync(memoryPath)) memory = JSON.parse(readFileSync(memoryPath, "utf-8"));
      memory.notes.push(memoryText);
      if (!existsSync(path.dirname(memoryPath))) mkdirSync(path.dirname(memoryPath), { recursive: true });
      writeFileSync(memoryPath, JSON.stringify(memory, null, 2));
    } catch { /* Ignore */ }
  }
}

export async function runAgent(
  config: AgentConfig,
  userMessage: string,
  context: MessageParam[] = [],
  onText?: (text: string) => void,
): Promise<{ messages: MessageParam[]; finalText: string; usage: Usage }> {
  // Load MCP servers if configured
  let allTools = BUILTIN_TOOLS;
  if (config.mcpServers && config.mcpServers.length > 0) {
    await loadMCPServers(config.mcpServers);
    const mcpTools = getMCPTools();
    if (mcpTools.length > 0) {
      allTools = [...BUILTIN_TOOLS, ...mcpTools];
      if (onText) onText(pc.dim(`[MCP] Loaded ${mcpTools.length} tools from ${config.mcpServers.length} server(s)\n`));
    }
  }

  let activeContext = [...context];
  let totalUsage: Usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0, costEstimate: 0 };

  // Context Management: Summarize if history is too long
  if (activeContext.length > MAX_HISTORY_MESSAGES) {
    if (onText) onText(pc.dim("\n[System] Summarizing long conversation history to save context...\n"));
    const summaryMsg = await summarizeHistory(config, activeContext.slice(0, -4));
    activeContext = [summaryMsg, ...activeContext.slice(-4)];
  }

  const messages: MessageParam[] = [
    ...activeContext,
    { role: "user" as const, content: userMessage },
  ];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const stream = sendToProviderStream(
      config,
      messages,
      allTools,
    );

    let text = "";
    let toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];

    for await (const event of stream) {
      switch (event.type) {
        case "text_delta":
          if (event.text) {
            text += event.text;
            if (onText) onText(event.text);
          }
          break;
        case "text_end":
          // Text is already accumulated in text_delta for streaming
          // but we ensure it's finalized if needed
          if (event.text && !text) text = event.text;
          break;
        case "tool_use":
          toolCalls = event.toolCalls ?? [];
          break;
        case "usage":
          if (event.usage) {
            totalUsage.inputTokens += event.usage.inputTokens;
            totalUsage.outputTokens += event.usage.outputTokens;
            totalUsage.totalTokens += event.usage.totalTokens;
            totalUsage.costEstimate += event.usage.costEstimate;
          }
          break;
      }
    }

    // If model stops with just text, we're done
    if (toolCalls.length === 0) {
      if (text) {
        messages.push({ role: "assistant" as const, content: text });
        if (onText) onText(text + "\n");
      }
      
      // Auto-Memory Reflection
      if (onText) onText(pc.dim("[System] Reflecting on task for project memory...\n"));
      await reflectAndStore(config, messages);
      
      return { messages, finalText: "", usage: totalUsage };
    }

    // Execute all tool calls in this round
    const results: ToolResult[] = await Promise.all(toolCalls.map(async (tc) => {
      if (tc.name.startsWith("mcp_")) {
        return callMCPTool(tc.name, tc.input);
      }
      return executeTool(tc, config);
    }));

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
    usage: totalUsage
  };
}
