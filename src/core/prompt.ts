import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { TaskManager } from "./tasks.js";
import { detectCapabilities, formatCapabilities } from "./capabilities.js";
import { loadProjectProfile, formatProjectProfile } from "./project.js";
import { readSoulFiles, readGlobalSoulFiles, initGlobalSoulVault } from "./soul.js";

export interface PromptLayer {
  name: string;
  source: string;
  content: string;
}

export interface PromptBuildResult {
  systemPrompt: string;
  layers: PromptLayer[];
  profile: string;
}

const PROMPT_DIR = path.join(homedir(), ".lulu", "prompts");
const DEFAULT_PROFILE = "default";
const DEFAULT_SKILL_LIMIT = 5;

export function getPromptDir(): string {
  return PROMPT_DIR;
}

export function listPromptProfiles(): string[] {
  if (!existsSync(PROMPT_DIR)) return [];
  return readdirSync(PROMPT_DIR)
    .filter((file) => file.endsWith(".md"))
    .map((file) => path.basename(file, ".md"))
    .sort();
}

export function readPromptProfile(profile = DEFAULT_PROFILE): string | null {
  const profilePath = path.join(PROMPT_DIR, `${profile}.md`);
  if (!existsSync(profilePath)) return null;
  const content = readFileSync(profilePath, "utf-8").trim();
  return content || null;
}

export function writePromptProfile(profile: string, content: string): string {
  assertPromptProfileName(profile);
  if (!existsSync(PROMPT_DIR)) mkdirSync(PROMPT_DIR, { recursive: true });
  const profilePath = path.join(PROMPT_DIR, `${profile}.md`);
  writeFileSync(profilePath, content.trimEnd() + "\n", "utf-8");
  return profilePath;
}

export function buildSystemPrompt(options: {
  basePrompt: string;
  env?: NodeJS.ProcessEnv;
  projectName: string;
  projectRoot: string;
}): PromptBuildResult {
  const env = options.env ?? process.env;
  const profile = env.LULU_PROMPT_PROFILE?.trim() || DEFAULT_PROFILE;
  const envBasePrompt = env.LULU_SYSTEM_PROMPT?.trim();
  const layers: PromptLayer[] = [
    {
      name: envBasePrompt ? "base-override" : "base",
      source: envBasePrompt ? "LULU_SYSTEM_PROMPT" : "providers.json",
      content: envBasePrompt || options.basePrompt,
    },
  ];

  const profilePrompt = readPromptProfile(profile);
  if (profilePrompt) {
    layers.push({
      name: "profile",
      source: path.join(PROMPT_DIR, `${profile}.md`),
      content: profilePrompt,
    });
  }

  const projectPrompt = readProjectPrompt(options.projectRoot);
  if (projectPrompt) {
    layers.push({
      name: "project",
      source: projectPrompt.source,
      content: projectPrompt.content,
    });
  }

  appendSoulLayers(layers, options.projectRoot);

  const profileData = loadProjectProfile(options.projectRoot);
  if (profileData) {
    layers.push({
      name: "project-profile",
      source: "lulu.json / package.json",
      content: formatProjectProfile(profileData),
    });
  }

  appendJsonLayer(layers, {
    name: "project-memory",
    source: path.join(homedir(), ".lulu", "projects", options.projectName, "memory.json"),
    heading: `Project Memory (${options.projectName})`,
  });

  appendSkillLayer(layers, env.LULU_PROMPT_QUERY || "", parseSkillLimit(env.LULU_SKILL_LIMIT), options.projectRoot);

  layers.push({
    name: "system-capabilities",
    source: "Auto-detection",
    content: formatCapabilities(detectCapabilities()),
  });

  appendTaskLayer(layers, options.projectName);

  return {
    systemPrompt: layers.map(formatPromptLayer).join("\n\n"),
    layers,
    profile,
  };
}

function appendSoulLayers(layers: PromptLayer[], projectRoot: string): void {
  // Global soul first (applies to every project)
  initGlobalSoulVault();
  for (const file of readGlobalSoulFiles()) {
    layers.push({
      name: `global-soul-${path.basename(file.name, ".md").toLowerCase()}`,
      source: file.path,
      content: file.content,
    });
  }
  // Project soul overrides global (project-specific rules take precedence)
  for (const file of readSoulFiles(projectRoot)) {
    layers.push({
      name: `soul-${path.basename(file.name, ".md").toLowerCase()}`,
      source: file.path,
      content: file.content,
    });
  }
}

export function describePrompt(result: PromptBuildResult): string {
  const lines = [
    `Prompt profile: ${result.profile}`,
    `Prompt length: ${result.systemPrompt.length} characters`,
    "Layers:",
  ];
  for (const layer of result.layers) {
    lines.push(`- ${layer.name}: ${layer.source} (${layer.content.length} chars)`);
  }
  return lines.join("\n");
}

function readProjectPrompt(projectRoot: string): { source: string; content: string } | null {
  const paths = [
    path.join(projectRoot, ".lulu-prompt.md"),
    path.join(projectRoot, ".lulu", "prompt.md"),
  ];
  for (const promptPath of paths) {
    if (!existsSync(promptPath)) continue;
    const content = readFileSync(promptPath, "utf-8").trim();
    if (content) return { source: promptPath, content };
  }
  return null;
}

function appendJsonLayer(
  layers: PromptLayer[],
  options: { name: string; source: string; heading: string },
): void {
  if (!existsSync(options.source)) return;
  try {
    const raw = readFileSync(options.source, "utf-8");
    if (!raw.trim()) return;
    const parsed = JSON.parse(raw);
    layers.push({
      name: options.name,
      source: options.source,
      content: `# ${options.heading}\n${JSON.stringify(parsed, null, 2)}`,
    });
  } catch {
    // Ignore invalid optional context files.
  }
}

function appendSkillLayer(layers: PromptLayer[], query: string, limit: number, projectRoot: string): void {
  // Try new skill system first
  try {
    const { loadAllSkills, searchSkills } = require("./skills.js");
    const skills = loadAllSkills(projectRoot);

    if (skills.length === 0) {
      // Fallback to old skills.json
      appendLegacySkillLayer(layers, query, limit);
      return;
    }

    const results = searchSkills(query, skills, limit);
    if (results.length === 0) return;

    const lines = ["# Retrieved Skills", ""];
    for (const r of results) {
      lines.push(`## ${r.skill.name}`);
      lines.push(`**Category:** ${r.skill.category}`);
      lines.push(`**Triggers:** ${r.skill.triggers.join(", ")}`);
      lines.push("");
      lines.push(r.skill.content);
      lines.push("");
    }

    layers.push({
      name: "retrieved-skills",
      source: "Skill System",
      content: lines.join("\n"),
    });
  } catch {
    // Fallback to legacy skills.json
    appendLegacySkillLayer(layers, query, limit);
  }
}

function appendLegacySkillLayer(layers: PromptLayer[], query: string, limit: number): void {
  const source = path.join(homedir(), ".lulu", "skills.json");
  if (!existsSync(source)) return;
  try {
    const raw = readFileSync(source, "utf-8");
    if (!raw.trim()) return;
    const parsed = JSON.parse(raw);
    const skills = Object.entries(parsed).map(([name, value]) => {
      const skill = value as any;
      const searchable = [
        name,
        skill.name,
        skill.description,
        Array.isArray(skill.steps) ? skill.steps.join(" ") : skill.steps,
      ].filter(Boolean).join(" ");
      return { name, value: skill, score: scoreSkill(query, searchable) };
    });

    const selected = skills
      .filter((skill) => !query || skill.score > 0)
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
      .slice(0, limit);

    if (selected.length === 0) return;

    const formatted = Object.fromEntries(selected.map((skill) => [skill.name, skill.value]));
    layers.push({
      name: "retrieved-skills",
      source,
      content: `# Retrieved Skills\n${JSON.stringify(formatted, null, 2)}`,
    });
  } catch {
    // Ignore invalid optional skill files.
  }
}

function scoreSkill(query: string, searchable: string): number {
  if (!query.trim()) return 1;
  const haystack = searchable.toLowerCase();
  const words = Array.from(new Set(query.toLowerCase().split(/[^a-z0-9_./-]+/).filter((word) => word.length >= 3)));
  return words.reduce((score, word) => score + (haystack.includes(word) ? 1 : 0), 0);
}

function parseSkillLimit(value: string | undefined): number {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_SKILL_LIMIT;
}

function appendTaskLayer(layers: PromptLayer[], projectName: string): void {
  try {
    const taskManager = new TaskManager(projectName);
    const tasks = taskManager.listActiveTasks();
    if (tasks.length === 0) return;

    const formattedTasks = tasks.map(t => {
      const checklist = t.checklist || [];
      const done = checklist.filter((c: any) => c.completed).length;
      const total = checklist.length;
      return `- [${t.id}] ${t.status.toUpperCase()} | ${t.priority.toUpperCase()} | ${t.title} ${total > 0 ? `(${done}/${total})` : ""}${t.owner ? ` (@${t.owner})` : ""}`;
    }).join("\n");

    layers.push({
      name: "active-tasks",
      source: "Task Engine",
      content: `# Active Tasks\n${formattedTasks}\n\nUse task_update or task_add_log to report progress.`
    });
  } catch {
    // Ignore errors in task fetching
  }
}

function formatPromptLayer(layer: PromptLayer): string {
  if (layer.name === "base" || layer.name === "base-override") return layer.content.trim();
  const title = layer.name.toUpperCase().replace(/-/g, " ");
  return `\n=== ${title} ===\n${layer.content.trim()}\n================\n`;
}

function assertPromptProfileName(profile: string): void {
  if (!/^[A-Za-z0-9_.-]+$/.test(profile)) {
    throw new Error("Prompt profile name must contain only letters, numbers, dots, underscores, or hyphens.");
  }
}
