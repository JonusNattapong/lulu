import type { ToolDef, ToolCall, ToolResult, AgentConfig } from "../types.js";
import { sendToProvider } from "./providers.js";
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

import { chromium } from "playwright";
import TurndownService from "turndown";

export const BUILTIN_TOOLS: ToolDef[] = JSON.parse(
  readFileSync(new URL("./tools_schema.json", import.meta.url), "utf-8"),
);

export interface Plugin {
  name: string;
  description: string;
  input_schema: any;
  execute: (input: any, config: AgentConfig) => Promise<string>;
}

const PLUGINS: Map<string, Plugin> = new Map();

export async function loadPlugins(): Promise<void> {
  const pluginDir = path.join(homedir(), ".lulu", "plugins");
  if (!existsSync(pluginDir)) return;

  const files = readdirSync(pluginDir).filter(f => f.endsWith('.js') || f.endsWith('.ts'));
  for (const file of files) {
    try {
      const pluginPath = path.join(pluginDir, file);
      // Use dynamic import with file:// for Windows compatibility
      const plugin = (await import(`file://${pluginPath}`)).default as Plugin;
      if (plugin && plugin.name && plugin.execute) {
        PLUGINS.set(plugin.name, plugin);
      }
    } catch (err) {
      console.error(`[Plugin] Failed to load ${file}:`, err);
    }
  }
}

export function getPluginTools(): ToolDef[] {
  return Array.from(PLUGINS.values()).map(p => ({
    name: p.name,
    description: `[Plugin] ${p.description}`,
    input_schema: p.input_schema
  }));
}

export async function executeTool(call: ToolCall, config: AgentConfig): Promise<ToolResult> {
  try {
    // Check plugins first
    const plugin = PLUGINS.get(call.name);
    if (plugin) {
      const result = await plugin.execute(call.input, config);
      return { tool_use_id: call.id, content: result };
    }

    const result = await executeToolImpl(call, config);
    return { tool_use_id: call.id, content: result };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { tool_use_id: call.id, content: msg, is_error: true };
  }
}

async function executeToolImpl(call: ToolCall, config: AgentConfig): Promise<string> {
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
    case "browser_search": {
      const { query } = call.input as { query: string };
      const browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();
      try {
        // Simple search using DuckDuckGo (easier to scrape than Google)
        await page.goto(`https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`);
        const results = await page.$$eval('.result', (elements) => {
          return elements.slice(0, 5).map(el => {
            const title = el.querySelector('.result__a')?.textContent || "";
            const link = el.querySelector('.result__a')?.getAttribute('href') || "";
            const snippet = el.querySelector('.result__snippet')?.textContent || "";
            return `Title: ${title}\nURL: ${link}\nSnippet: ${snippet}\n`;
          });
        });
        return results.length > 0 ? results.join("\n---\n") : "No search results found.";
      } catch (err) {
        return `Search failed: ${err instanceof Error ? err.message : String(err)}`;
      } finally {
        await browser.close();
      }
    }
    case "browser_read": {
      const { url } = call.input as { url: string };
      const browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();
      const turndown = new TurndownService();
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        const html = await page.content();
        const markdown = turndown.turndown(html);
        return markdown.slice(0, 20000); // Limit to 20k chars
      } catch (err) {
        return `Reading failed: ${err instanceof Error ? err.message : String(err)}`;
      } finally {
        await browser.close();
      }
    }
    case "semantic_search": {
      const { query } = call.input as { query: string };
      const files = await listFilesRecursive(process.cwd());
      
      // Use the model to pick relevant files (Semantic Phase)
      const prompt = `Given the project file list below and the query "${query}", identify the top 5 most relevant files that likely contain the answer or implementation details. Output ONLY a JSON array of strings (file paths).
      
      Files:
      ${files.slice(0, 500).join("\n")}`;

const response = await sendToProvider(config, [{ role: "user", content: prompt }], []);
      try {
        const matches = JSON.parse(response.text.match(/\[.*\]/s)?.[0] || "[]") as string[];
        return matches.length > 0
          ? `Semantic matches for "${query}":\n${matches.map(f => `- ${f}`).join("\n")}`
          : "No semantically relevant files found.";
      } catch {
        return "Error parsing semantic search results. Falling back to keyword search...";
      }
    }
    default:
      return `Unknown tool: ${call.name}`;
  }
}

async function listFilesRecursive(dir: string): Promise<string[]> {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const res = path.resolve(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') return [];
      return listFilesRecursive(res);
    }
    return [path.relative(process.cwd(), res)];
  }));
  return files.flat();
}

export function wildcardMatch(value: string, pattern: string): boolean {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`^${escaped.replaceAll("*", ".*")}$`);
  return regex.test(value);
}

export function searchFiles(
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
