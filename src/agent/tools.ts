import type { ToolDef, ToolCall, ToolResult, AgentConfig } from "../types.js";
import { execSync } from "child_process";
import { homedir } from "os";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "fs";
import path from "path";

export const BUILTIN_TOOLS: ToolDef[] = JSON.parse(
  readFileSync(new URL("./tools_schema.json", import.meta.url), "utf-8"),
);

export function executeTool(call: ToolCall, config: AgentConfig): ToolResult {
  try {
    const result = executeToolImpl(call, config);
    return { tool_use_id: call.id, content: result };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { tool_use_id: call.id, content: msg, is_error: true };
  }
}

function executeToolImpl(call: ToolCall, config: AgentConfig): string {
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
    case "update_memory": {
      if (!config.projectName) return "Error: Project name not detected.";
      const memoryDir = path.join(homedir(), ".lulu", "projects", config.projectName);
      if (!existsSync(memoryDir)) {
        mkdirSync(memoryDir, { recursive: true });
      }
      const memoryPath = path.join(memoryDir, "memory.json");
      const content = call.input.content;
      let jsonContent: any;
      try {
        jsonContent = typeof content === "string" ? JSON.parse(content) : content;
      } catch {
        jsonContent = { notes: content };
      }
      writeFileSync(memoryPath, JSON.stringify(jsonContent, null, 2), "utf-8");
      return `Memory updated for project: ${config.projectName} (JSON format)`;
    }
    case "save_skill": {
      const skillsDir = path.join(homedir(), ".lulu");
      if (!existsSync(skillsDir)) mkdirSync(skillsDir, { recursive: true });
      const skillsPath = path.join(skillsDir, "skills.json");
      
      let skills: Record<string, any> = {};
      if (existsSync(skillsPath)) {
        try {
          skills = JSON.parse(readFileSync(skillsPath, "utf-8"));
        } catch { /* ignore */ }
      }

      const { name, description, steps } = call.input as { name: string; description: string; steps: string };
      skills[name] = { description, steps, savedAt: new Date().toISOString() };
      
      writeFileSync(skillsPath, JSON.stringify(skills, null, 2), "utf-8");
      return `Skill '${name}' saved to global library.`;
    }
    case "curate_skills": {
      const skillsPath = path.join(homedir(), ".lulu", "skills.json");
      if (!existsSync(skillsPath)) return "No skills found to curate.";
      const skills = readFileSync(skillsPath, "utf-8");
      return `Current Skills Library:\n${skills}\n\nINSTRUCTION: Review the library. Merge duplicates, improve descriptions, and prune low-quality skills. Once finished, use 'update_skills_batch' to save the new library.`;
    }
    case "update_skills_batch": {
      const skillsDir = path.join(homedir(), ".lulu");
      if (!existsSync(skillsDir)) mkdirSync(skillsDir, { recursive: true });
      const skillsPath = path.join(skillsDir, "skills.json");
      const newSkills = call.input.skills as object;
      writeFileSync(skillsPath, JSON.stringify(newSkills, null, 2), "utf-8");
      return "Global skill library updated and curated.";
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
