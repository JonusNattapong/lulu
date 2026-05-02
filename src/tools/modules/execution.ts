import type { Tool } from "../registry.js";
import { executionManager } from "../../core/execution.js";
import { redact } from "../../core/secrets.js";

export const executionTools: Tool[] = [
  {
    name: "run_in_backend",
    category: "execution",
    description: "Execute a command through a specific backend: local, tmux, docker, or ssh.",
    risk: "high",
    input_schema: {
      type: "object",
      properties: {
        command: { type: "string", description: "Command to execute." },
        backend: {
          type: "string",
          description: "Execution backend: local (default), tmux, docker, ssh.",
          enum: ["local", "tmux", "docker", "ssh"]
        },
        cwd: { type: "string", description: "Working directory." },
        timeout: { type: "number", description: "Timeout in milliseconds. Default: 120000." }
      },
      required: ["command"]
    },
    execute: async (input) => {
      const id = `exec-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const result = await executionManager.execute({
        id,
        backend: input.backend || "local",
        command: input.command,
        cwd: input.cwd,
        timeout: input.timeout,
      });

      if (result.error) {
        return `Error (${result.status}): ${result.error}`;
      }

      const lines = [
        `Backend: ${result.status}`,
        result.exitCode !== undefined ? `Exit code: ${result.exitCode}` : "",
        result.durationMs ? `Duration: ${result.durationMs}ms` : "",
      ].filter(Boolean);

      if (result.stdout) lines.push(`\n--- stdout ---\n${redact(result.stdout)}`);
      if (result.stderr) lines.push(`\n--- stderr ---\n${redact(result.stderr)}`);

      return lines.join("\n");
    }
  },
  {
    name: "list_backends",
    category: "execution",
    description: "List available execution backends and their status.",
    risk: "low",
    input_schema: { type: "object", properties: {} },
    execute: async () => {
      const backends = executionManager.listBackends();
      const lines = ["Available Execution Backends:"];
      for (const b of backends) {
        const status = b.available ? "✓ available" : "✗ unavailable";
        lines.push(`  ${b.type} | ${b.name} | ${status}`);
        lines.push(`    ${b.description}`);
      }
      return lines.join("\n");
    }
  },
  {
    name: "execution_status",
    category: "execution",
    description: "Check the status of a running or completed execution.",
    risk: "low",
    input_schema: {
      type: "object",
      properties: {
        execution_id: { type: "string", description: "Execution ID." }
      },
      required: ["execution_id"]
    },
    execute: async (input) => {
      const result = executionManager.getStatus(input.execution_id);
      if (!result) return `Execution not found: ${input.execution_id}`;

      const lines = [
        `Execution: ${result.id}`,
        `Status: ${result.status}`,
        result.exitCode !== undefined ? `Exit code: ${result.exitCode}` : "",
        result.durationMs ? `Duration: ${result.durationMs}ms` : "",
        result.startedAt ? `Started: ${result.startedAt}` : "",
        result.endedAt ? `Ended: ${result.endedAt}` : "",
        result.error ? `Error: ${result.error}` : "",
      ].filter(Boolean);

      if (result.stdout) lines.push(`\n--- stdout (${result.stdout.split("\n").length} lines) ---\n${redact(result.stdout.slice(0, 500))}`);
      if (result.stderr) lines.push(`\n--- stderr (${result.stderr.split("\n").length} lines) ---\n${redact(result.stderr.slice(0, 500))}`);

      return lines.join("\n");
    }
  },
  {
    name: "list_executions",
    category: "execution",
    description: "List all tracked executions in the current session.",
    risk: "low",
    input_schema: { type: "object", properties: {} },
    execute: async () => {
      const executions = executionManager.listExecutions();
      if (executions.length === 0) return "No tracked executions.";

      const lines = ["Tracked Executions:"];
      for (const e of executions) {
        const status = e.result?.status || "pending";
        const duration = e.result?.durationMs ? ` (${e.result.durationMs}ms)` : "";
        lines.push(`  ${e.id} | ${e.backend} | ${status}${duration}`);
        lines.push(`    ${e.command.slice(0, 80)}${e.command.length > 80 ? "..." : ""}`);
      }
      return lines.join("\n");
    }
  },
  {
    name: "abort_execution",
    category: "execution",
    description: "Abort a running execution by its ID.",
    risk: "high",
    input_schema: {
      type: "object",
      properties: {
        execution_id: { type: "string", description: "Execution ID to abort." }
      },
      required: ["execution_id"]
    },
    execute: async (input) => {
      const ok = executionManager.abort(input.execution_id);
      return ok
        ? `Abort signalled for: ${input.execution_id}`
        : `Failed to abort or execution not found: ${input.execution_id}`;
    }
  },
];
