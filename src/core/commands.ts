import type { AgentConfig } from "../types/types.js";
import { SessionManager } from "./session.js";
import { TaskManager } from "./tasks.js";
import { loadProjectProfile } from "./project.js";
import { capabilitiesSummary, detectCapabilities, formatCapabilities } from "./capabilities.js";
import { describePrompt } from "./prompt.js";
import { loadPromptBuild } from "./config.js";

export interface CommandContext {
  sessionId: string;
  channel: "cli" | "api" | "telegram" | "dashboard";
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
