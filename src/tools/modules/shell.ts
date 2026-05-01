import { execSync, execFileSync } from "node:child_process";
import type { Tool } from "../registry.js";
import { SecurityManager } from "../../core/security.js";

export const shellTools: Tool[] = [
  {
    name: "run_command",
    category: "shell",
    description: "Run a shell command and return its output. Use with caution.",
    risk: "high",
    permissions: ["command"],
    input_schema: {
      type: "object",
      properties: {
        command: { type: "string", description: "The shell command to execute" },
        description: { type: "string", description: "Brief description of what the command does" }
      },
      required: ["command"]
    },
    execute: async (input) => {
      const cmd = input.command as string;
      SecurityManager.validateCommand(cmd);
      const out = execSync(cmd, { encoding: "utf-8", timeout: 30000 });
      return out || "(no output)";
    }
  },
  {
    name: "tmux_list_sessions",
    category: "shell",
    description: "List running tmux sessions.",
    risk: "low",
    permissions: ["command"],
    input_schema: { type: "object", properties: {} },
    execute: async () => runTmux(["list-sessions", "-F", "#{session_name}\t#{session_windows}\t#{session_attached}\t#{session_created_string}"])
  },
  {
    name: "tmux_new_session",
    category: "shell",
    description: "Create a new tmux session.",
    risk: "medium",
    permissions: ["command"],
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Session name." },
        command: { type: "string", description: "Optional command to run." },
        startDirectory: { type: "string", description: "Optional working directory." },
        detached: { type: "boolean", description: "Create the session detached. Defaults to true." }
      },
      required: ["name"]
    },
    execute: async (input) => {
      const name = input.name as string;
      if (input.command) SecurityManager.validateCommand(input.command);
      const args = ["new-session", "-d", "-s", name];
      if (input.startDirectory) args.push("-c", input.startDirectory);
      if (input.command) args.push(input.command);
      runTmux(args);
      return `Created tmux session: ${input.name}`;
    }
  },
  {
    name: "tmux_send_keys",
    category: "shell",
    description: "Send text or keys to a tmux target.",
    risk: "medium",
    permissions: ["command"],
    input_schema: {
      type: "object",
      properties: {
        target: { type: "string", description: "tmux target." },
        keys: { type: "string", description: "Text or tmux key name." },
        enter: { "type": "boolean", "description": "Send Enter after the keys. Defaults to true." }
      },
      required: ["target", "keys"]
    },
    execute: async (input) => {
      SecurityManager.validateCommand(input.keys);
      const args = ["send-keys", "-t", input.target, input.keys];
      if (input.enter !== false) args.push("Enter");
      runTmux(args);
      return `Sent keys to tmux target: ${input.target}`;
    }
  },
  {
    name: "tmux_capture_pane",
    category: "shell",
    description: "Capture text from a tmux pane.",
    risk: "low",
    permissions: ["command"],
    input_schema: {
      type: "object",
      properties: {
        target: { type: "string", description: "tmux target." },
        start: { type: "integer", description: "Start line." },
        end: { type: "integer", description: "End line." }
      },
      required: ["target"]
    },
    execute: async (input) => runTmux(["capture-pane", "-p", "-t", input.target, "-S", String(input.start || -200), "-E", String(input.end || -1)])
  },
  {
    name: "tmux_kill_session",
    category: "shell",
    description: "Kill a tmux session by name.",
    risk: "medium",
    permissions: ["command"],
    input_schema: {
      type: "object",
      properties: { name: { type: "string", description: "Session name to kill." } },
      required: ["name"]
    },
    execute: async (input) => {
      runTmux(["kill-session", "-t", input.name]);
      return `Killed tmux session: ${input.name}`;
    }
  }
];

function runTmux(args: string[]): string {
  return execFileSync("tmux", args, {
    encoding: "utf-8",
    timeout: 30000,
    maxBuffer: 1024 * 1024,
  }).trim() || "(no output)";
}
