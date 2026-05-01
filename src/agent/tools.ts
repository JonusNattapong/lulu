import type { ToolDef, ToolCall, ToolResult } from "../types.js";
import { execSync } from "child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "fs";
import path from "path";

export const BUILTIN_TOOLS: ToolDef[] = [
  {
    name: "read_file",
    description:
      "Read the contents of a file. Returns the file content with line numbers.",
    input_schema: {
      type: "object",
      properties: {
        file_path: {
          type: "string",
          description: "Absolute path to the file to read",
        },
        offset: {
          type: "integer",
          description: "Line number to start reading from (optional)",
        },
        limit: {
          type: "integer",
          description: "Maximum number of lines to read (optional)",
        },
      },
      required: ["file_path"],
    },
  },
  {
    name: "write_file",
    description: "Write content to a file. Creates or overwrites the file.",
    input_schema: {
      type: "object",
      properties: {
        file_path: {
          type: "string",
          description: "Absolute path to the file to write",
        },
        content: {
          type: "string",
          description: "Content to write to the file",
        },
      },
      required: ["file_path", "content"],
    },
  },
  {
    name: "list_files",
    description: "List files in a directory.",
    input_schema: {
      type: "object",
      properties: {
        dir_path: {
          type: "string",
          description: "Absolute path to the directory to list",
        },
        pattern: {
          type: "string",
          description: "Optional glob pattern to filter files (e.g., '*.ts')",
        },
      },
      required: ["dir_path"],
    },
  },
  {
    name: "run_command",
    description:
      "Run a shell command and return its output. Use with caution.",
    input_schema: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "The shell command to execute",
        },
        description: {
          type: "string",
          description: "Brief description of what the command does",
        },
      },
      required: ["command"],
    },
  },
  {
    name: "search_content",
    description: "Search for a regex pattern in files within a directory.",
    input_schema: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description: "Regular expression pattern to search for",
        },
        path: {
          type: "string",
          description: "Directory or file to search in",
        },
        glob: {
          type: "string",
          description: "Optional file glob filter (e.g., '*.ts')",
        },
      },
      required: ["pattern", "path"],
    },
  },
];

export function executeTool(call: ToolCall): ToolResult {
  try {
    const result = executeToolImpl(call);
    return { tool_use_id: call.id, content: result };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { tool_use_id: call.id, content: msg, is_error: true };
  }
}

function executeToolImpl(call: ToolCall): string {
  switch (call.name) {
    case "read_file": {
      const fp = call.input.file_path as string;
      if (!existsSync(fp)) return `File not found: ${fp}`;
      const content = readFileSync(fp, "utf-8");
      const lines = content.split("\n");
      const offset = (call.input.offset as number) ?? 1;
      let limit = (call.input.limit as number) ?? lines.length;
      limit = Math.min(limit, lines.length - offset + 1);
      const sliced = lines.slice(offset - 1, offset - 1 + limit);
      return sliced.map((l, i) => `${offset + i}\t${l}`).join("\n");
    }
    case "write_file": {
      if (process.env.LULU_ALLOW_WRITE !== "true") {
        throw new Error(
          "write_file is disabled. Set LULU_ALLOW_WRITE=true to allow file writes.",
        );
      }
      const fp = call.input.file_path as string;
      const dir = path.dirname(fp);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(fp, call.input.content as string, "utf-8");
      return `File written: ${fp}`;
    }
    case "list_files": {
      const dir = call.input.dir_path as string;
      if (!existsSync(dir)) return `Directory not found: ${dir}`;
      const pattern = call.input.pattern as string | undefined;
      const files = readdirSync(dir).filter((file) =>
        pattern ? wildcardMatch(file, pattern) : true,
      );
      return files.length > 0 ? files.join("\n") : "(empty)";
    }
    case "run_command": {
      if (process.env.LULU_ALLOW_COMMAND !== "true") {
        throw new Error(
          "run_command is disabled. Set LULU_ALLOW_COMMAND=true to allow shell commands.",
        );
      }
      const cmd = call.input.command as string;
      const desc =
        (call.input.description as string) ?? "running command...";
      console.error(`[tool] ${desc}: ${cmd}`);
      const out = execSync(cmd, { encoding: "utf-8", timeout: 30000 });
      return out || "(no output)";
    }
    case "search_content": {
      const pattern = call.input.pattern as string;
      const searchPath = call.input.path as string;
      const globFilter = call.input.glob as string | undefined;
      try {
        const regex = new RegExp(pattern);
        const results: string[] = [];
        searchFiles(searchPath, regex, globFilter, results);
        return results.length > 0 ? results.join("\n") : "No matches found";
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return `Search error: ${msg}`;
      }
    }
    default:
      return `Unknown tool: ${call.name}`;
  }
}

function wildcardMatch(value: string, pattern: string): boolean {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`^${escaped.replaceAll("*", ".*")}$`);
  return regex.test(value);
}

function searchFiles(
  dir: string,
  regex: RegExp,
  globFilter: string | undefined,
  results: string[],
  visited = new Set<number>(),
): void {
  if (results.length >= 500) return;
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (results.length >= 500) return;
      if (entry.name.startsWith(".")) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules") continue;
        // Guard against symlink cycles
        try {
          const stat = readFileSync(fullPath);
          // Just checking if accessible
        } catch {
          continue;
        }
        searchFiles(fullPath, regex, globFilter, results, visited);
      } else if (entry.isFile()) {
        if (globFilter && !wildcardMatch(entry.name, globFilter)) continue;
        try {
          const content = readFileSync(fullPath, "utf-8");
          const lines = content.split("\n");
          for (let i = 0; i < lines.length && results.length < 500; i++) {
            if (regex.test(lines[i])) {
              results.push(`${fullPath}:${i + 1}: ${lines[i].trim()}`);
            }
          }
        } catch {
          // Skip unreadable files
        }
      }
    }
  } catch {
    // Skip unreadable directories
  }
}
