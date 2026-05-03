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
import { appendFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import pc from "picocolors";
import { MemoryManager } from "./memory.js";
import { redact } from "./secrets.js";
import { eventBus } from "./events.js";
import { userProfile } from "./user-profile.js";
import { skillProposalManager } from "./skill-proposal.js";
import { proactiveEngine } from "./proactive.js";
import { globalMemory } from "./global-memory.js";
import { preferenceLearner } from "./preferences.js";
import { selfReflection } from "./self-reflection.js";
import { improveSkill } from "./skill-improvement.js";

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
  
  const reflectionPrompt = "Reflect on the session.\n1. Extract a single-paragraph summary of project knowledge (MEMORY UPDATE).\n2. If you discovered a NEW reusable workflow, describe it as a SKILL (SKILL UPDATE).\n3. If you used an EXISTING skill and found ways to improve it (e.g. missing steps, better prompts), describe it (SKILL IMPROVEMENT: [SkillName] | [Notes]).\nFormat: MEMORY UPDATE: ... SKILL UPDATE: ... SKILL IMPROVEMENT: ...";
  
  const stream = sendToProviderStream(config, [
    ...messages,
    { role: "user", content: reflectionPrompt }
  ], []);

  let reflection = "";
  for await (const event of stream) {
    if (event.type === "text_end") reflection = event.text ?? "";
  }

  if (reflection.includes("MEMORY UPDATE:")) {
    const memoryPart = reflection.split("MEMORY UPDATE:")[1]?.split("SKILL UPDATE:")[0]?.split("SKILL IMPROVEMENT:")[0]?.trim();
    if (memoryPart) {
      await memoryManager.addMemory(config, memoryPart, { type: "reflection" });
    }
  }

  if (reflection.includes("SKILL UPDATE:")) {
    const skillPart = reflection.split("SKILL UPDATE:")[1]?.split("SKILL IMPROVEMENT:")[0]?.trim();
    if (skillPart) {
      const skillName = skillProposalManager.generateSkillName(skillPart, "auto-learned");
      skillProposalManager.propose({
        name: skillName,
        description: "Auto-learned workflow from session reflection",
        category: "auto-generated",
        triggers: [skillName, "auto-learned workflow"],
        steps: skillPart,
        examples: [],
      });
    }
  }

  if (reflection.includes("SKILL IMPROVEMENT:") && process.env.LULU_AUTO_EVOLVE_SKILLS !== "false") {
    const improvePart = reflection.split("SKILL IMPROVEMENT:")[1]?.trim();
    if (improvePart) {
      const [skillName, ...notesArr] = improvePart.split("|");
      const notes = notesArr.join("|").trim();
      if (skillName && notes) {
        try {
          const result = improveSkill({
            skillName: skillName.trim(),
            projectRoot: config.projectRoot,
            notes: `Auto-evolved from session reflection: ${notes}`,
            apply: true
          });
          if (result && result.applied) {
            proactiveEngine.suggest({
              type: "opportunity",
              title: `✨ Skill Auto-Evolved: ${result.skillName}`,
              body: `I automatically improved the skill **${result.skillName}** to version ${result.newVersion} based on our recent session.\nNotes: ${notes}`,
              context: `skill:${result.skillName}`,
              priority: "high",
            });
            console.log(`[Agent] Skill auto-evolved: ${result.skillName} (v${result.newVersion})`);
          }
        } catch (e) {
          console.error("[Reflection] Auto-improve failed:", e);
        }
      }
    }
  }
}

export async function runAgent(
  config: AgentConfig,
  prompt: string,
  history: MessageParam[] = [],
  onToken?: (token: string) => void,
) {
  const sessionId = `sess-${Date.now()}`;
  eventBus.emit("session:start", { prompt, projectName: config.projectName }, sessionId);

  // Build proactive suggestion context at session start
  const proactiveContext = proactiveEngine.buildSessionStartText();

  // Check for missing SOUL vault
  if (config.projectRoot) {
    const { hasSoulVault } = await import("./soul.js");
    if (!hasSoulVault(config.projectRoot)) {
      proactiveEngine.suggest({
        title: "SOUL vault not found",
        body: `This project has no SOUL vault. Run /soul init to create behavior rules, identity, and workspace conventions.`,
        context: `project: ${config.projectRoot}`,
        type: "recommendation",
        priority: "low",
        tags: ["init-soul", "setup"],
      });
    }
  }

  // Build global memory context
  const globalContext = globalMemory.buildContext();

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

  // Update system prompt with memory, proactive context, and global context
  const sessionConfig = {
    ...config,
    systemPrompt: config.systemPrompt + memoryContext + (proactiveContext ? `\n${proactiveContext}` : "") + (globalContext ? `\n${globalContext}` : "")
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
        eventBus.emit("agent:token", { text: event.text }, sessionId);
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
      eventBus.emit("tool:start", { name: call.name, input: call.input }, sessionId);
      let result: ToolResult;
      if (call.name.startsWith("mcp_")) {
        result = await callMCPTool(call.name, call.input);
        result = { ...result, tool_use_id: call.id };
      } else {
        result = await executeTool(call, sessionConfig);
      }
      results.push(result);
      eventBus.emit("tool:end", { name: call.name, result }, sessionId);
    }

    messages.push(toolResultToClaudeMessage(results));
  }

  // After session, reflect, store, and detect patterns
  await reflectAndStore(sessionConfig, messages);
  proactiveEngine.recordPattern(`session:${config.projectName || "default"}`);

  // Detect preferences from conversation text
  for (const msg of messages) {
    if (typeof msg.content === "string") {
      preferenceLearner.detectPreferences(msg.content);
    }
  }

  // Learn from tool usage frequency
  const toolCounts = new Map<string, number>();
  for (const msg of messages) {
    if (typeof msg.content === "string") {
      const matches = msg.content.matchAll(/"name":\s*"([^"]+)"/g);
      for (const m of matches) toolCounts.set(m[1], (toolCounts.get(m[1]) || 0) + 1);
    }
  }
  for (const [tool, count] of toolCounts) {
    if (count >= 3) preferenceLearner.learnFromToolUsage(tool, count);
  }

  // Check for skill opportunity in this session
  if (messages.length > 10) {
    for (const [tool, count] of toolCounts) {
      if (count >= 5) {
        const name = skillProposalManager.generateSkillName(`${tool} workflow`, tool);
        const id = skillProposalManager.propose({
          name,
          description: `Repetitive use of \`${tool}\` detected (${count} times). Consider creating a skill.`,
          category: "auto-generated",
          triggers: [tool],
          steps: `Automated workflow using ${tool} tool.`,
        });
        proactiveEngine.recordPattern(`skill:${tool}`);
        console.log(`[Agent] Skill proposal created: ${name} (ID: ${id})`);
      }
    }
  }
  
  // Log session to history
  const logPath = path.join(homedir(), ".lulu", "history.jsonl");
  const logEntry = {
    timestamp: new Date().toISOString(),
    projectName: config.projectName,
    prompt: redact(prompt),
    finalText: redact((messages[messages.length - 1].content as string) || ""),
    usage: totalUsage
  };
  appendFileSync(logPath, JSON.stringify(logEntry) + "\n");

  const finalResponse = {
    finalText: messages[messages.length - 1].content as string,
    messages,
    usage: totalUsage
  };

  eventBus.emit("session:end", finalResponse, sessionId);

  return finalResponse;
}
