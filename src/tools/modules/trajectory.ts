import { type Tool } from "../registry.js";
import { exportTrajectory, saveExportToFile, listExportedTrajectories, loadTrajectoryFile } from "../../core/trajectory.js";
import { redact } from "../../core/secrets.js";
import type { AgentConfig } from "../../types/types.js";
import { existsSync } from "fs";
import path from "path";
import { homedir } from "os";

export const trajectoryTools: Tool[] = [
  {
    name: "export_trajectory",
    category: "agent",
    description: "Export session trajectories as JSON/JSONL for debugging, evaluation, or fine-tuning datasets.",
    risk: "low",
    input_schema: {
      type: "object",
      properties: {
        session_id: { type: "string", description: "Export a specific session. If omitted, exports all sessions." },
        channel: { type: "string", description: "Filter by channel: cli, api, telegram, dashboard." },
        project_name: { type: "string", description: "Filter by project name." },
        format: { type: "string", description: "Output format: 'json' (pretty) or 'jsonl' (stream). Default: json." },
        save_to_file: { type: "boolean", description: "Save to ~/.lulu/trajectories/ directory. Default: false (return inline)." },
      }
    },
    execute: async (input, _config) => {
      const { session_id, channel, project_name, format, save_to_file } = input;
      const filter = { channel, projectName: project_name };
      const exports = exportTrajectory(session_id, filter);

      if (exports.length === 0) {
        return "No sessions found matching the filter.";
      }

      const lines: string[] = [`Exported ${exports.length} trajectory(ies):`];

      for (const exp of exports) {
        lines.push(`\n--- ${exp.sessionId} ---`);
        lines.push(`Channel: ${exp.channel} | Model: ${exp.model} | Turns: ${exp.turns.length}`);
        lines.push(`Total tokens: ${exp.totalTokens} | Cost: $${exp.totalCost.toFixed(6)}`);
        lines.push(`Project: ${exp.projectName || "unknown"}`);
        for (const turn of exp.turns) {
          lines.push(`  Turn ${turn.turnIndex}: ${turn.prompt.slice(0, 80)}${turn.prompt.length > 80 ? "..." : ""}`);
          if (turn.toolCalls.length > 0) {
            lines.push(`    Tools: ${turn.toolCalls.map(t => t.tool).join(", ")}`);
          }
        }
      }

      if (save_to_file) {
        const paths = saveExportToFile(exports, format === "jsonl" ? "jsonl" : "json");
        const exportDir = path.join(homedir(), ".lulu", "trajectories");
        lines.push(`\nSaved to: ${paths.join(", ")}`);
        lines.push(`Browse at: ${exportDir}`);
      }

      return lines.join("\n");
    }
  },
  {
    name: "list_trajectories",
    category: "agent",
    description: "List previously exported trajectory files.",
    risk: "low",
    input_schema: {
      type: "object",
      properties: {}
    },
    execute: async () => {
      const files = listExportedTrajectories();
      if (files.length === 0) return "No exported trajectories yet. Use export_trajectory to create one.";

      const lines: string[] = [];
      for (const f of files) {
        const sizeKB = (f.size / 1024).toFixed(1);
        lines.push(`${f.createdAt} | ${sizeKB}KB | ${f.path}`);
      }
      return lines.join("\n");
    }
  },
  {
    name: "load_trajectory",
    category: "agent",
    description: "Load and display a previously exported trajectory file.",
    risk: "low",
    input_schema: {
      type: "object",
      properties: {
        file_path: { type: "string", description: "Path to the trajectory JSON or JSONL file." }
      },
      required: ["file_path"]
    },
    execute: async (input) => {
      if (!existsSync(input.file_path)) {
        return `File not found: ${input.file_path}`;
      }
      const exports = loadTrajectoryFile(input.file_path);
      if (exports.length === 0) return "Empty file.";

      const lines: string[] = [];
      for (const exp of exports) {
        lines.push(`Session: ${exp.sessionId} | Channel: ${exp.channel} | Model: ${exp.model}`);
        lines.push(`Exported: ${exp.exportedAt} | Turns: ${exp.turns.length} | Tokens: ${exp.totalTokens}`);
        for (const turn of exp.turns) {
          lines.push(`  [Turn ${turn.turnIndex}] ${turn.prompt.slice(0, 100)}${turn.prompt.length > 100 ? "..." : ""}`);
          if (turn.responseText) {
            lines.push(`    → ${turn.responseText.slice(0, 200)}${turn.responseText.length > 200 ? "..." : ""}`);
          }
          for (const tc of turn.toolCalls) {
            lines.push(`    [${tc.tool}] ${tc.output.slice(0, 100)}${tc.output.length > 100 ? "..." : ""}`);
          }
        }
      }
      return redact(lines.join("\n"));
    }
  },
];
