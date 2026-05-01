import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { sendToProvider } from "../../providers/providers.js";
import { listFilesRecursive } from "../utils.js";
import type { Tool } from "../registry.js";

export const agentTools: Tool[] = [
  {
    name: "update_memory",
    category: "agent",
    description: "Update persistent project memory.",
    risk: "low",
    input_schema: {
      type: "object",
      properties: { content: { type: "string" } },
      required: ["content"]
    },
    execute: async (input, config) => {
      if (!config.projectName) return "Error: Project name not detected.";
      const memoryDir = path.join(homedir(), ".lulu", "projects", config.projectName);
      if (!existsSync(memoryDir)) mkdirSync(memoryDir, { recursive: true });
      const memoryPath = path.join(memoryDir, "memory.json");
      const content = input.content;
      let jsonContent: any;
      try { jsonContent = typeof content === "string" ? JSON.parse(content) : content; }
      catch { jsonContent = { notes: content }; }
      writeFileSync(memoryPath, JSON.stringify(jsonContent, null, 2), "utf-8");
      return `Memory updated for project: ${config.projectName}`;
    }
  },
  {
    name: "save_skill",
    category: "agent",
    description: "Save a reusable skill or workflow pattern.",
    risk: "low",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        description: { type: "string" },
        steps: { type: "string" }
      },
      required: ["name", "description", "steps"]
    },
    execute: async (input) => {
      const skillsDir = path.join(homedir(), ".lulu");
      if (!existsSync(skillsDir)) mkdirSync(skillsDir, { recursive: true });
      const skillsPath = path.join(skillsDir, "skills.json");
      let skills: Record<string, any> = {};
      if (existsSync(skillsPath)) {
        try { skills = JSON.parse(readFileSync(skillsPath, "utf-8")); } catch { /* ignore */ }
      }
      const { name, description, steps } = input;
      skills[name] = { description, steps, savedAt: new Date().toISOString() };
      writeFileSync(skillsPath, JSON.stringify(skills, null, 2), "utf-8");
      return `Skill '${name}' saved.`;
    }
  },
  {
    name: "semantic_search",
    category: "agent",
    description: "Find files based on natural language meaning.",
    risk: "low",
    input_schema: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"]
    },
    execute: async (input, config) => {
      const { query } = input;
      const files = await listFilesRecursive(process.cwd());
      const prompt = `Given the project file list below and the query "${query}", identify the top 5 relevant files. Output ONLY a JSON array of strings.\n\nFiles:\n${files.slice(0, 500).join("\n")}`;
      const response = await sendToProvider(config, [{ role: "user", content: prompt }], []);
      const matches = JSON.parse(response.text.match(/\[.*\]/s)?.[0] || "[]") as string[];
      return matches.length > 0 ? matches.map(f => `- ${f}`).join("\n") : "No relevant files found.";
    }
  }
];
