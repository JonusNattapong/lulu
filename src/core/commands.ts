import type { AgentConfig } from "../types/types.js";
import { SessionManager } from "./session.js";
import { TaskManager } from "./tasks.js";
import { loadProjectProfile } from "./project.js";
import { capabilitiesSummary, detectCapabilities, formatCapabilities } from "./capabilities.js";
import { describePrompt } from "./prompt.js";
import { loadPromptBuild } from "./config.js";
import { initSoulVault } from "./soul.js";
import "./skill-commands.js";
import "./audit-commands.js";
import { personalAgentDaemon } from "./daemon.js";
import { userProfile } from "./user-profile.js";
import { skillProposalManager } from "./skill-proposal.js";
import { proactiveEngine } from "./proactive.js";
import { globalMemory } from "./global-memory.js";
import { taskQueue } from "./task-queue.js";
import { autonomousResearcher } from "./autonomous-research.js";

export interface CommandContext {
  sessionId: string;
  channel: "cli" | "api" | "telegram" | "dashboard" | "subagent";
  config: AgentConfig;
  sessionManager: SessionManager;
}

export interface CommandResult {
  text: string;
  data?: any;
}

export interface Command {
  name: string;
  description: string;
  execute: (args: string[], context: CommandContext) => Promise<CommandResult>;
}

export class CommandRegistry {
  private commands = new Map<string, Command>();

  register(command: Command) {
    this.commands.set(command.name, command);
  }

  getCommand(name: string): Command | undefined {
    return this.commands.get(name);
  }

  listCommands(): Command[] {
    return Array.from(this.commands.values());
  }

  async handle(text: string, context: CommandContext): Promise<CommandResult | null> {
    if (!text.startsWith("/")) return null;
    
    const parts = text.split(/\s+/);
    const commandName = parts[0].substring(1).toLowerCase();
    const args = parts.slice(1);

    const cmd = this.commands.get(commandName);
    if (!cmd) return { text: `Unknown command: /${commandName}` };

    return await cmd.execute(args, context);
  }
}

export const commandRegistry = new CommandRegistry();

// Standard Commands
commandRegistry.register({
  name: "new",
  description: "Start a new session",
  execute: async (_, { sessionId, sessionManager }) => {
    sessionManager.reset(sessionId);
    return { text: "Session reset. Starting fresh!" };
  }
});

commandRegistry.register({
  name: "reset",
  description: "Reset current session and tasks",
  execute: async (_, { sessionId, sessionManager, config }) => {
    sessionManager.reset(sessionId);
    const taskManager = new TaskManager(config.projectName || "default");
    // Optionally clear tasks or just report status
    return { text: "Session and context reset." };
  }
});

commandRegistry.register({
  name: "status",
  description: "Show agent and system status",
  execute: async (_, { config }) => {
    const caps = detectCapabilities();
    const lines = [
      "=== Lulu Status ===",
      `Provider: ${config.provider}`,
      `Model: ${config.model}`,
      `Project: ${config.projectName}`,
      `Capabilities: ${capabilitiesSummary(caps)}`,
      `OS: ${caps.os.platform} (${caps.os.arch})`,
    ];
    return { text: lines.join("\n") };
  }
});

commandRegistry.register({
  name: "project",
  description: "Show current project profile",
  execute: async (_, { config }) => {
    const profile = loadProjectProfile(config.projectRoot || process.cwd());
    if (!profile) return { text: "No project profile found." };
    return { 
      text: `=== Project: ${profile.name} ===\nStack: ${profile.stack?.join(", ")}\nScripts: ${Object.keys(profile.scripts || {}).join(", ")}`,
      data: profile
    };
  }
});

commandRegistry.register({
  name: "prompt",
  description: "Show current system prompt layers",
  execute: async () => {
    const build = loadPromptBuild();
    return { text: describePrompt(build) };
  }
});

commandRegistry.register({
  name: "task",
  description: "Manage tasks: /task list, /task show <id>",
  execute: async (args, { config }) => {
    const taskManager = new TaskManager(config.projectName || "default");
    const sub = args[0]?.toLowerCase();

    if (sub === "list") {
      const tasks = await taskManager.listTasks();
      if (tasks.length === 0) return { text: "No tasks found." };
      return { text: tasks.map(t => `[${t.id}] ${t.status.toUpperCase()}: ${t.title}`).join("\n") };
    }

    if (sub === "show" && args[1]) {
      const task = await taskManager.getTask(args[1]);
      if (!task) return { text: `Task ${args[1]} not found.` };
      return { text: JSON.stringify(task, null, 2), data: task };
    }

    return { text: "Usage: /task list, /task show <id>" };
  }
});

commandRegistry.register({
  name: "soul",
  description: "Manage Obsidian-compatible .lulu/*.md soul files",
  execute: async (args, { config }) => {
    const sub = args[0]?.toLowerCase();
    if (sub === "init") {
      const written = initSoulVault(config.projectRoot || process.cwd());
      if (written.length === 0) return { text: "Soul vault already initialized." };
      return { text: `Soul vault initialized:\n${written.map((file) => `- ${file}`).join("\n")}` };
    }
    return { text: "Usage: /soul init" };
  }
});

// Daemon Commands
commandRegistry.register({
  name: "daemon",
  description: "Start/stop/status of personal agent daemon",
  execute: async (args) => {
    const sub = args[0]?.toLowerCase();
    if (!sub || sub === "start") {
      if (personalAgentDaemon.isRunning()) {
        return { text: "Daemon is already running." };
      }
      personalAgentDaemon.start();
      return { text: "Personal agent daemon started." };
    }
    if (sub === "stop") {
      if (!personalAgentDaemon.isRunning()) {
        return { text: "Daemon is not running." };
      }
      personalAgentDaemon.stop();
      return { text: "Daemon stopped." };
    }
    if (sub === "status") {
      const status = personalAgentDaemon.getStatus();
      return { text: `Daemon ${status.pid ? "running" : "stopped"}\nPID: ${status.pid}\nUptime: ${status.uptime}s\nSessions: ${status.sessions}\nTurns: ${status.turns}\nMemory: ${status.memoryUsage}MB\nActive agents: ${status.activeAgents}\nPending proposals: ${status.pendingProposals}\nActive suggestions: ${status.activeSuggestions}`, data: status };
    }
    return { text: "Usage: /daemon [start|stop|status]" };
  }
});

commandRegistry.register({
  name: "proposals",
  description: "Review skill proposals: /proposals list, approve <id>, reject <id>",
  execute: async (args) => {
    const sub = args[0]?.toLowerCase();

    if (sub === "list" || !sub) {
      const proposals = skillProposalManager.list();
      if (proposals.length === 0) return { text: "No pending proposals. Run complex workflows to generate suggestions." };
      const lines = [`${proposals.length} pending proposal(s):`];
      for (const p of proposals) {
        lines.push(`  [${p.id}] ${p.name} — ${p.description.slice(0, 60)}... (freq: ${p.frequency})`);
      }
      lines.push("\nApprove: /proposals approve <id>");
      lines.push("Reject:  /proposals reject <id>");
      return { text: lines.join("\n"), data: proposals };
    }

    if (sub === "approve" && args[1]) {
      const result = skillProposalManager.approve(args[1]);
      if (!result) return { text: `Proposal ${args[1]} not found or already reviewed.` };
      return { text: `Approved: ${result.name}. Skill file created at ~/.lulu/skills/auto-generated/${result.name.replace(/\s+/g, "-").toLowerCase()}/SKILL.md` };
    }

    if (sub === "reject" && args[1]) {
      skillProposalManager.reject(args[1]);
      return { text: `Rejected proposal ${args[1]}.` };
    }

    return { text: "Usage: /proposals [list|approve <id>|reject <id>]" };
  }
});

commandRegistry.register({
  name: "preferences",
  description: "Show learned user preferences: /preferences",
  execute: async () => {
    const stats = userProfile.getStats();
    const top = userProfile.getProfile().preferences.slice(-10);
    const lines = [`=== User Preferences ===`, `Sessions: ${stats.sessions}, Turns: ${stats.turns}`];
    if (top.length > 0) {
      lines.push("Recent preferences:");
      for (const p of top) {
        lines.push(`  ${p.key}: ${p.value} (${(p.confidence * 100).toFixed(0)}% confidence)`);
      }
    } else {
      lines.push("No preferences learned yet.");
    }
    return { text: lines.join("\n") };
  }
});

commandRegistry.register({
  name: "suggestions",
  description: "Show proactive suggestions: /suggestions list, dismiss <id>",
  execute: async (args) => {
    const sub = args[0]?.toLowerCase();

    if (sub === "list" || !sub) {
      const suggestions = proactiveEngine.list();
      if (suggestions.length === 0) return { text: "No active suggestions." };
      const lines = [`${suggestions.length} active suggestion(s):`];
      for (const s of suggestions) {
        lines.push(`  [${s.id}] [${s.priority}] ${s.title}: ${s.body.slice(0, 80)}`);
      }
      lines.push("\nDismiss: /suggestions dismiss <id>");
      return { text: lines.join("\n"), data: suggestions };
    }

    if (sub === "dismiss" && args[1]) {
      proactiveEngine.dismiss(args[1]);
      return { text: `Dismissed suggestion ${args[1]}.` };
    }

    return { text: "Usage: /suggestions [list|dismiss <id>]" };
  }
});

commandRegistry.register({
  name: "learn",
  description: "Explicitly teach a preference: /learn <key>=<value>",
  execute: async (args) => {
    const input = args.join(" ");
    const eqIdx = input.indexOf("=");
    if (eqIdx === -1) return { text: "Usage: /learn <key>=<value> (e.g., /learn codeStyle=typescript)" };
    const key = input.slice(0, eqIdx).trim();
    const value = input.slice(eqIdx + 1).trim();
    if (!key || !value) return { text: "Key and value cannot be empty." };
    userProfile.recordPreference(key, value, "explicit instruction", "explicit", 1.0);
    return { text: `Learned: ${key} = ${value}` };
  }
});

// Memory Commands
commandRegistry.register({
  name: "memory",
  description: "Global memory: /memory list, add <key>=<value>, search <query>",
  execute: async (args) => {
    const sub = args[0]?.toLowerCase();

    if (sub === "list") {
      const facts = globalMemory.search("");
      if (facts.length === 0) return { text: "No facts in global memory." };
      const lines = [`${facts.length} fact(s):`];
      for (const f of facts.slice(0, 20)) {
        lines.push(`  ${f.key}: ${f.value} [${f.category}]`);
      }
      return { text: lines.join("\n"), data: facts };
    }

    if (sub === "add" && args[1]) {
      const input = args.slice(1).join(" ");
      const eqIdx = input.indexOf("=");
      if (eqIdx === -1) return { text: "Usage: /memory add <key>=<value>" };
      const key = input.slice(0, eqIdx).trim();
      const value = input.slice(eqIdx + 1).trim();
      globalMemory.addFact({ key, value, source: "user", category: "fact", confidence: 0.9 });
      return { text: `Added: ${key} = ${value}` };
    }

    if (sub === "search" && args[1]) {
      const results = globalMemory.search(args.slice(1).join(" "));
      if (results.length === 0) return { text: "No matching facts found." };
      const lines = [`${results.length} match(es):`];
      for (const r of results) lines.push(`  ${r.key}: ${r.value}`);
      return { text: lines.join("\n"), data: results };
    }

    if (sub === "stats") {
      const stats = globalMemory.getStats();
      return { text: `Global Memory: ${stats.totalFacts} facts, ${stats.todoCount} todos, ${stats.pendingResearch} research items`, data: stats };
    }

    return { text: "Usage: /memory [list|add <key>=<value>|search <query>|stats]" };
  }
});

// Task Queue Commands
commandRegistry.register({
  name: "queue",
  description: "Task queue: /queue list, add <name>, run <id>, cancel <id>",
  execute: async (args) => {
    const sub = args[0]?.toLowerCase();

    if (sub === "list" || !sub) {
      const tasks = taskQueue.list();
      if (tasks.length === 0) return { text: "No tasks in queue." };
      const lines = [`${tasks.length} task(s):`];
      for (const t of tasks.slice(0, 20)) {
        lines.push(`  [${t.id.slice(-8)}] [${t.status}] ${t.priority} — ${t.name}`);
      }
      return { text: lines.join("\n"), data: tasks };
    }

    if (sub === "add" && args[1]) {
      const name = args.slice(1).join(" ");
      const task = taskQueue.enqueue({ name, type: "automation", priority: "medium" });
      return { text: `Queued: ${task.id.slice(-8)} — ${task.name}` };
    }

    if (sub === "run" && args[1]) {
      const id = args[1].includes("-") ? args[1] : `queue-${args[1]}`;
      const result = await taskQueue.run(id);
      return { text: `Result: ${result}` };
    }

    if (sub === "cancel" && args[1]) {
      const id = args[1].includes("-") ? args[1] : `queue-${args[1]}`;
      taskQueue.cancel(id);
      return { text: "Task cancelled." };
    }

    if (sub === "stats") {
      const stats = taskQueue.getStats();
      return { text: `Task Queue: ${stats.total} total, ${stats.pending} pending, ${stats.scheduled} scheduled`, data: stats };
    }

    return { text: "Usage: /queue [list|add <name>|run <id>|cancel <id>|stats]" };
  }
});

// Research Commands
commandRegistry.register({
  name: "research",
  description: "Autonomous research: /research <query>, /research list, /research run <id>",
  execute: async (args) => {
    const sub = args[0]?.toLowerCase();

    if (sub === "list" || !sub) {
      const topics = autonomousResearcher.list();
      if (topics.length === 0) return { text: "No research topics." };
      const lines = [`${topics.length} topic(s):`];
      for (const t of topics.slice(0, 20)) {
        lines.push(`  [${t.id.slice(-8)}] [${t.status}] [${t.depth}] ${t.query.slice(0, 60)}`);
      }
      return { text: lines.join("\n"), data: topics };
    }

    if (args[0] && sub !== "list" && sub !== "run") {
      // Treat as query
      const depth = (args.includes("--deep")) ? "deep" : (args.includes("--shallow")) ? "shallow" : "medium";
      const id = autonomousResearcher.queue(args.join(" "), depth);
      return { text: `Research queued: ${id.slice(-8)}. Use /research list to track progress.` };
    }

    if (sub === "run" && args[1]) {
      const id = args.slice(1).join("-");
      const topic = autonomousResearcher.list().find(t => t.id.includes(id));
      if (!topic) return { text: `Research ${id} not found.` };
      await autonomousResearcher.runTopic(topic);
      return { text: `Research done: ${topic.result?.summary?.slice(0, 200) || "completed"}` };
    }

    return { text: "Usage: /research <query> [--deep|--shallow], /research list, /research run <id>" };
  }
});
