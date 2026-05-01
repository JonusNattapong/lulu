import {
  type AgentConfig,
  type ToolResult,
} from "../types/types.js";
import {
  sendToProviderStream,
  toolResultToClaudeMessage,
  toolCallToClaudeMessage,
  type Usage,
} from "../providers/providers.js";
import { BUILTIN_TOOLS, executeTool, loadPlugins, getPluginTools } from "../tools/tools.js";
import { loadMCPServers, getMCPTools, callMCPTool, closeAllMCP } from "./mcp.js";
import type { MessageParam } from "@anthropic-ai/sdk/resources/index.js";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import pc from "picocolors";
import { MemoryManager } from "./memory.js";

const MAX_TOOL_ROUNDS = 10;
const MAX_HISTORY_MESSAGES = 12;

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
  const memoryManager = new MemoryManager(config.projectName || "default");
  
  const reflectionPrompt = "Reflect on the session. Extract a single-paragraph summary of project knowledge (MEMORY UPDATE). Also, if you discovered a reusable workflow or command pattern, describe it as a SKILL (SKILL UPDATE). Format: MEMORY UPDATE: ... SKILL UPDATE: ...";
  
  const stream = sendToProviderStream(config, [
    ...messages,
    { role: "user", content: reflectionPrompt }
  ], []);

  let reflection = "";
  for await (const event of stream) {
    if (event.type === "text_end") reflection = event.text ?? "";
  }

  if (reflection.includes("MEMORY UPDATE:")) {
    const memoryPart = reflection.split("MEMORY UPDATE:")[1]?.split("SKILL UPDATE:")[0]?.trim();
    if (memoryPart) {
      await memoryManager.addMemory(config, memoryPart, { type: "reflection" });
    }
  }

  if (reflection.includes("SKILL UPDATE:")) {
    const skillPart = reflection.split("SKILL UPDATE:")[1]?.trim();
    if (skillPart) {
      const skillsPath = path.join(homedir(), ".lulu", "skills.json");
      const currentSkills = existsSync(skillsPath) ? JSON.parse(readFileSync(skillsPath, "utf-8")) : {};
      const skillName = `auto-${Date.now()}`;
      currentSkills[skillName] = { name: skillName, description: "Auto-learned skill", steps: skillPart };
      writeFileSync(skillsPath, JSON.stringify(currentSkills, null, 2));
    }
  }
}

export async function runAgent(
  config: AgentConfig,
  prompt: string,
  history: MessageParam[] = [],
  onToken?: (token: string) => void,
) {
  // 1. Initial Memory Search
  const memoryManager = new MemoryManager(config.projectName || "default");
  let memoryContext = "";
  try {
    const relevantMemories = await memoryManager.search(config, prompt);
    if (relevantMemories.length > 0) {
      memoryContext = `\n[Relevant Project Memory]:\n${relevantMemories.map(m => `- ${m.content}`).join("\n")}`;
    }
  } catch (err) {
    console.error("[Memory] Search failed at startup:", err);
  }

  // Update system prompt with memory
  const sessionConfig = {
    ...config,
    systemPrompt: config.systemPrompt + memoryContext
  };

  await loadPlugins();
  const mcpServers = (config as any).mcpServers || [];
  await loadMCPServers(mcpServers);

  const tools = [
    ...BUILTIN_TOOLS,
    ...getPluginTools(),
    ...getMCPTools(),
  ];

  let messages: MessageParam[] = [...history];
  if (messages.length > MAX_HISTORY_MESSAGES) {
    const summaryMessage = await summarizeHistory(sessionConfig, messages);
    messages = [summaryMessage];
  }
  
  messages.push({ role: "user", content: prompt });

  let totalUsage: Usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0, costEstimate: 0 };
  let rounds = 0;

  while (rounds < MAX_TOOL_ROUNDS) {
    rounds++;
    let fullText = "";
    let toolCalls: any[] = [];
    let usage: Usage | undefined;

    const stream = sendToProviderStream(sessionConfig, messages, tools);

    for await (const event of stream) {
      if (event.type === "text_delta") {
        fullText += event.text;
        if (onToken) onToken(event.text || "");
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

    messages.push({ role: "assistant", content: fullText || "Thinking..." });

    if (toolCalls.length === 0) break;

    const results: ToolResult[] = [];
    for (const call of toolCalls) {
      if (call.name.startsWith("mcp_")) {
        const result = await callMCPTool(call.name, call.input);
        results.push({ ...result, tool_use_id: call.id });
      } else {
        const result = await executeTool(call, sessionConfig);
        results.push({ ...result, tool_use_id: call.id });
      }
    }

    messages.push(toolResultToClaudeMessage(results));
  }

  // After session, reflect and store
  await reflectAndStore(sessionConfig, messages);
  
  // Log session to history
  const logPath = path.join(homedir(), ".lulu", "history.jsonl");
  const logEntry = {
    timestamp: new Date().toISOString(),
    projectName: config.projectName,
    prompt,
    finalText: messages[messages.length - 1].content,
    usage: totalUsage
  };
  appendFileSync(logPath, JSON.stringify(logEntry) + "\n");

  return {
    finalText: messages[messages.length - 1].content as string,
    messages,
    usage: totalUsage
  };
}
