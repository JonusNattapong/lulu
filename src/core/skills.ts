import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { logSkillEvent } from "./audit.js";

export type SkillTrustLevel = "trusted" | "project" | "community" | "unknown";

export interface SkillPermissionSummary {
  trustLevel: SkillTrustLevel;
  sourceType: "built-in" | "project" | "global" | "unknown";
  permissions: string[];
  tools: string[];
  warnings: string[];
}

export interface Skill {
  name: string;
  version: string;
  description: string;
  triggers: string[];
  category: string;
  qualityBar: string;
  steps: string[];
  tools?: string[];
  scripts?: string[];
  dependencies?: string[];
  trustLevel: SkillTrustLevel;
  permissions: string[];
  permissionSummary: SkillPermissionSummary;
  content: string; // Full markdown content
  source: string; // File path or built-in
}

export interface SkillResult {
  skill: Skill;
  score: number;
  matchedTriggers: string[];
}

const SKILL_CACHE_TTL = 60_000; // 1 minute
let skillCache = new Map<string, { skills: Skill[]; timestamp: number }>();

export function clearSkillCache(): void {
  skillCache.clear();
}

export function getGlobalSkillDir(): string {
  return path.join(homedir(), ".lulu", "skills");
}

export function getProjectSkillDir(projectRoot: string): string {
  return path.join(projectRoot, "skills");
}

export function getBuiltInSkillDir(): string {
  return fileURLToPath(new URL("../skills", import.meta.url));
}

export function parseSkillFrontmatter(content: string): Partial<Skill> {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { content };

  const yaml = match[1];
  const markdown = match[2];

  const result: Partial<Skill> = { content: markdown.trim() };

  // Parse YAML frontmatter
  for (const line of yaml.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;

    const key = line.slice(0, colonIdx).trim();
    let value = line.slice(colonIdx + 1).trim();

    // Handle arrays
    if (value.startsWith("[") && value.endsWith("]")) {
      value = value.slice(1, -1);
      const items = value.split(",").map((s) => s.trim().replace(/^["']|["']$/g, ""));
      (result as any)[key] = items;
    } else {
      (result as any)[key] = value.replace(/^["']|["']$/g, "");
    }
  }

  // Extract steps from markdown body
  // Match various section names: Steps, Health Checks, Common Operations, etc.
  const stepsMatch = markdown.match(/##\s*(?:Steps|Health Checks|Common Operations|Output Format|Checklist|Security Checklist|Pre-deployment Checklist)[\s\S]*?\n([\s\S]*?)(?:\n##|\n#|$)/i);
  if (stepsMatch) {
    const stepsText = stepsMatch[1];
    // Extract numbered or bulleted items
    const steps = stepsText
      .split("\n")
      .map((line: string) => line.replace(/^\d+[\.\)]\s*|^\s*[-*]\s*/, "").trim())
      .filter((s: string) => s && !s.startsWith("#") && !s.startsWith("```"));
    if (steps.length > 0) {
      result.steps = steps;
    }
  }

  if ((result as any).quality_bar && !result.qualityBar) {
    result.qualityBar = (result as any).quality_bar;
  }
  if ((result as any).trust_level && !result.trustLevel) {
    result.trustLevel = (result as any).trust_level;
  }

  return result;
}

export function loadSkillFile(filePath: string): Skill | null {
  try {
    const content = readFileSync(filePath, "utf-8");
    const parsed = parseSkillFrontmatter(content);
    const tools = parsed.tools || [];
    const declaredPermissions = normalizeList((parsed as any).permissions);
    const explicitTrustLevel = normalizeTrustLevel((parsed as any).trust_level);
    const permissionSummary = summarizeSkillPermissions({
      content: parsed.content || content,
      tools,
      permissions: declaredPermissions,
      sourceType: classifySkillSource(filePath),
      explicitTrustLevel,
    });

    return {
      name: parsed.name || path.basename(path.dirname(filePath)),
      version: parsed.version || "1.0.0",
      description: parsed.description || "",
      triggers: parsed.triggers || [],
      category: parsed.category || "general",
      qualityBar: parsed.qualityBar || "",
      steps: parsed.steps || [],
      tools,
      scripts: parsed.scripts,
      dependencies: parsed.dependencies,
      trustLevel: permissionSummary.trustLevel,
      permissions: permissionSummary.permissions,
      permissionSummary,
      content: parsed.content || content,
      source: filePath,
    };
  } catch {
    return null;
  }
}

export function loadSkillsFromDir(dir: string, recursive = true): Skill[] {
  if (!existsSync(dir)) return [];

  const skills: Skill[] = [];
  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory() && recursive) {
      const skillFile = path.join(fullPath, "SKILL.md");
      if (existsSync(skillFile)) {
        const skill = loadSkillFile(skillFile);
        if (skill) skills.push(skill);
      } else {
        // Recurse into category folders
        skills.push(...loadSkillsFromDir(fullPath, true));
      }
    } else if (entry.isFile() && entry.name === "SKILL.md") {
      const skill = loadSkillFile(fullPath);
      if (skill) skills.push(skill);
    }
  }

  return skills;
}

export function loadAllSkills(projectRoot?: string): Skill[] {
  const now = Date.now();
  const cacheKey = projectRoot ? path.resolve(projectRoot) : "__global__";

  // Return cached skills if fresh
  const cached = skillCache.get(cacheKey);
  if (cached && now - cached.timestamp < SKILL_CACHE_TTL) {
    return cached.skills;
  }

  const skills: Skill[] = [];

  // Load project-specific skills first (higher priority)
  if (projectRoot) {
    const projectDir = getProjectSkillDir(projectRoot);
    skills.push(...loadSkillsFromDir(projectDir));
  }

  // Load global skills
  const globalDir = getGlobalSkillDir();
  skills.push(...loadSkillsFromDir(globalDir));

  // Load built-in skills bundled with Lulu
  const builtInDir = getBuiltInSkillDir();
  skills.push(...loadSkillsFromDir(builtInDir));

  // Cache the result
  skillCache.set(cacheKey, { skills, timestamp: now });

  return skills;
}

export function searchSkills(query: string, skills: Skill[], limit = 10): SkillResult[] {
  if (!query.trim()) {
    return skills.slice(0, limit).map((skill) => ({
      skill,
      score: 1,
      matchedTriggers: [],
    }));
  }

  const queryWords = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 2);

  const results: SkillResult[] = skills.map((skill) => {
    const searchable = [
      skill.name,
      skill.description,
      skill.category,
      ...skill.triggers,
      ...skill.steps,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    const matchedTriggers: string[] = [];
    let score = 0;

    // Exact trigger match (highest priority)
    for (const trigger of skill.triggers) {
      const triggerLower = trigger.toLowerCase();
      if (query.toLowerCase().includes(triggerLower)) {
        score += 10;
        matchedTriggers.push(trigger);
      }
      if (queryWords.some((w) => triggerLower.includes(w))) {
        score += 3;
      }
    }

    // Word matches
    for (const word of queryWords) {
      if (searchable.includes(word)) {
        score += 1;
      }
      // Partial match bonus
      const partialMatches = searchable.split(" ").filter((s) => s.includes(word));
      score += partialMatches.length * 0.5;
    }

    // Category match
    if (queryWords.some((w) => skill.category.toLowerCase().includes(w))) {
      score += 5;
    }

    // Name match (high weight)
    if (queryWords.some((w) => skill.name.toLowerCase().includes(w))) {
      score += 8;
    }

    return { skill, score, matchedTriggers };
  });

  return results
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.skill.name.localeCompare(b.skill.name))
    .slice(0, limit);
}

export function getSkillsByCategory(skills: Skill[], category: string): Skill[] {
  return skills.filter((s) => s.category === category);
}

export function getSkillsByTrigger(skills: Skill[], query: string): Skill[] {
  const queryLower = query.toLowerCase();
  return skills.filter(
    (s) =>
      s.triggers.some((t) => t.toLowerCase().includes(queryLower)) ||
      s.name.toLowerCase().includes(queryLower)
  );
}

// Skill file creation
export function createSkill(params: {
  name: string;
  description: string;
  triggers: string[];
  category: string;
  qualityBar: string;
  steps: string[];
  tools?: string[];
  dependencies?: string[];
  trustLevel?: SkillTrustLevel;
  permissions?: string[];
  auditContext?: { projectName?: string; sessionId?: string; channel?: string };
}): string {
  const skillDir = path.join(getGlobalSkillDir(), params.category, params.name);
  if (!existsSync(skillDir)) mkdirSync(skillDir, { recursive: true });

  const content = renderSkillMarkdown(params);

  const skillPath = path.join(skillDir, "SKILL.md");
  writeFileSync(skillPath, content, "utf-8");

  logSkillEvent("create", {
    name: params.name,
    category: params.category,
    path: skillPath,
    trustLevel: params.trustLevel || "community",
    permissions: params.permissions || inferPermissionsFromText(content, params.tools || []),
  }, params.auditContext);

  // Invalidate cache
  clearSkillCache();

  return skillPath;
}

export function previewSkill(params: {
  name: string;
  description: string;
  triggers: string[];
  category: string;
  qualityBar: string;
  steps: string[];
  tools?: string[];
  dependencies?: string[];
  trustLevel?: SkillTrustLevel;
  permissions?: string[];
  auditContext?: { projectName?: string; sessionId?: string; channel?: string };
}): string {
  const content = renderSkillMarkdown(params);
  const summary = summarizeSkillPermissions({
    content,
    tools: params.tools || [],
    permissions: params.permissions || [],
    sourceType: "global",
    explicitTrustLevel: params.trustLevel,
  });

  return [
    `Dry run: skill would be written to ${path.join(getGlobalSkillDir(), params.category, params.name, "SKILL.md")}`,
    "",
    formatPermissionSummary(summary),
    "",
    "```markdown",
    content.trimEnd(),
    "```",
  ].join("\n");
}

function renderSkillMarkdown(params: {
  name: string;
  description: string;
  triggers: string[];
  category: string;
  qualityBar: string;
  steps: string[];
  tools?: string[];
  dependencies?: string[];
  trustLevel?: SkillTrustLevel;
  permissions?: string[];
}): string {
  const permissions = params.permissions || inferPermissionsFromText(params.steps.join("\n"), params.tools || []);

  return `---
name: ${params.name}
version: 1.0.0
description: ${params.description}
triggers: [${params.triggers.map((t) => `"${t}"`).join(", ")}]
category: ${params.category}
quality_bar: ${params.qualityBar}
trust_level: ${params.trustLevel || "community"}
permissions: [${permissions.map((p) => `"${p}"`).join(", ")}]
---

# ${params.name}

## Overview
${params.description}

## Quality Bar
${params.qualityBar}

## Steps
${params.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}

${params.tools?.length ? `## Tools Required\n${params.tools.map((t) => `- ${t}`).join("\n")}\n` : ""}
${params.dependencies?.length ? `## Dependencies\n${params.dependencies.map((d) => `- ${d}`).join("\n")}\n` : ""}
`;
}

// Skill file deletion
export function deleteSkill(skillName: string, category?: string): boolean {
  const skillDir = path.join(getGlobalSkillDir(), category || "custom", skillName);

  if (existsSync(skillDir)) {
    const { rmSync } = require("node:fs");
    rmSync(skillDir, { recursive: true });
    clearSkillCache();
    return true;
  }

  // Try to find the skill in any category
  const globalDir = getGlobalSkillDir();
  if (!existsSync(globalDir)) return false;

  const { readdirSync } = require("node:fs");
  const entries = readdirSync(globalDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const skillPath = path.join(globalDir, entry.name, skillName);
      if (existsSync(skillPath)) {
        const { rmSync } = require("node:fs");
        rmSync(skillPath, { recursive: true });
        clearSkillCache();
        return true;
      }
    }
  }

  return false;
}

// Skillify: capture workflow as skill
export function skillify(params: {
  name: string;
  description: string;
  workflow: string;
  triggers: string[];
  category?: string;
  trustLevel?: SkillTrustLevel;
  permissions?: string[];
  auditContext?: { projectName?: string; sessionId?: string; channel?: string };
}): string {
  return createSkill({
    name: params.name,
    description: params.description,
    triggers: params.triggers,
    category: params.category || "learned",
    qualityBar: "Successfully completed the workflow",
    steps: params.workflow.split("\n").filter(Boolean),
    trustLevel: params.trustLevel,
    permissions: params.permissions,
    auditContext: params.auditContext,
  });
}

// List categories
export function listCategories(skills: Skill[]): string[] {
  const categories = new Set(skills.map((s) => s.category));
  return Array.from(categories).sort();
}

// Get skill statistics
export function getSkillStats(skills: Skill[]): {
  total: number;
  byCategory: Record<string, number>;
  bySource: Record<string, number>;
} {
  const stats = {
    total: skills.length,
    byCategory: {} as Record<string, number>,
    bySource: {} as Record<string, number>,
  };

  for (const skill of skills) {
    stats.byCategory[skill.category] = (stats.byCategory[skill.category] || 0) + 1;

    const source = classifySkillSource(skill.source);
    stats.bySource[source] = (stats.bySource[source] || 0) + 1;
  }

  return stats;
}

// Validate skill conformance
export function validateSkill(skill: Skill): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!skill.name) errors.push("Missing name");
  if (!skill.description) errors.push("Missing description");
  if (!skill.triggers.length) errors.push("Missing triggers");
  if (!skill.steps.length) errors.push("Missing steps");
  if (!skill.category) errors.push("Missing category");

  return { valid: errors.length === 0, errors };
}

// Format skill for display
export function formatSkill(skill: Skill): string {
  const lines = [
    `## ${skill.name} (v${skill.version})`,
    "",
    skill.description,
    "",
    "**Triggers:** " + skill.triggers.join(", "),
    "**Category:** " + skill.category,
    "**Trust:** " + skill.trustLevel,
    "**Permissions:** " + (skill.permissions.join(", ") || "none"),
  ];

  if (skill.qualityBar) {
    lines.push("**Quality Bar:** " + skill.qualityBar);
  }

  if (skill.steps.length) {
    lines.push("", "**Steps:**");
    skill.steps.forEach((step, i) => lines.push(`${i + 1}. ${step}`));
  }

  if (skill.tools?.length) {
    lines.push("", "**Tools:** " + skill.tools.join(", "));
  }

  if (skill.permissionSummary.warnings.length) {
    lines.push("", "**Safety Warnings:**");
    skill.permissionSummary.warnings.forEach((warning) => lines.push(`- ${warning}`));
  }

  lines.push("", `*Source: ${skill.source}*`);

  return lines.join("\n");
}

export function formatPermissionSummary(summary: SkillPermissionSummary): string {
  const lines = [
    "## Permission Summary",
    "",
    `- Trust level: ${summary.trustLevel}`,
    `- Source: ${summary.sourceType}`,
    `- Permissions: ${summary.permissions.join(", ") || "none"}`,
    `- Tools: ${summary.tools.join(", ") || "none declared"}`,
  ];

  if (summary.warnings.length) {
    lines.push("- Warnings:");
    summary.warnings.forEach((warning) => lines.push(`  - ${warning}`));
  }

  return lines.join("\n");
}

export function summarizeSkillLibrary(skills: Skill[]): string {
  const byTrust: Record<string, number> = {};
  const byPermission: Record<string, number> = {};
  const warnings: string[] = [];

  for (const skill of skills) {
    byTrust[skill.trustLevel] = (byTrust[skill.trustLevel] || 0) + 1;
    for (const permission of skill.permissions) {
      byPermission[permission] = (byPermission[permission] || 0) + 1;
    }
    for (const warning of skill.permissionSummary.warnings) {
      warnings.push(`${skill.name}: ${warning}`);
    }
  }

  const lines = [
    `## Skill Safety (${skills.length} skills)`,
    "",
    "**Trust Levels:**",
    ...Object.entries(byTrust).map(([level, count]) => `- ${level}: ${count}`),
    "",
    "**Permissions:**",
    ...(Object.keys(byPermission).length
      ? Object.entries(byPermission).map(([permission, count]) => `- ${permission}: ${count}`)
      : ["- none declared: 0"]),
  ];

  if (warnings.length) {
    lines.push("", "**Warnings:**", ...warnings.slice(0, 20).map((warning) => `- ${warning}`));
    if (warnings.length > 20) lines.push(`- ...and ${warnings.length - 20} more`);
  }

  return lines.join("\n");
}

function classifySkillSource(filePath: string): SkillPermissionSummary["sourceType"] {
  const normalized = path.resolve(filePath);
  if (normalized.startsWith(path.resolve(getGlobalSkillDir()))) return "global";
  if (normalized.startsWith(path.resolve(getBuiltInSkillDir()))) return "built-in";
  if (normalized.includes(`${path.sep}skills${path.sep}`)) return "project";
  return "unknown";
}

function normalizeTrustLevel(value: unknown): SkillTrustLevel | undefined {
  if (value === "trusted" || value === "project" || value === "community" || value === "unknown") {
    return value;
  }
  return undefined;
}

function normalizeList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

function summarizeSkillPermissions(options: {
  content: string;
  tools: string[];
  permissions: string[];
  sourceType: SkillPermissionSummary["sourceType"];
  explicitTrustLevel?: SkillTrustLevel;
}): SkillPermissionSummary {
  const permissions = Array.from(new Set([...options.permissions, ...inferPermissionsFromText(options.content, options.tools)])).sort();
  const tools = Array.from(new Set(options.tools)).sort();
  const warnings: string[] = [];

  if (permissions.includes("shell")) warnings.push("May run shell commands.");
  if (permissions.includes("write")) warnings.push("May write files or create artifacts.");
  if (permissions.includes("network")) warnings.push("May access network resources.");
  if (permissions.includes("secrets")) warnings.push("Mentions credentials, tokens, keys, or environment secrets.");
  if (options.sourceType === "global") warnings.push("Global skills can affect every project; review community skills before use.");

  return {
    trustLevel: options.explicitTrustLevel || defaultTrustLevel(options.sourceType),
    sourceType: options.sourceType,
    permissions,
    tools,
    warnings: Array.from(new Set(warnings)),
  };
}

function defaultTrustLevel(sourceType: SkillPermissionSummary["sourceType"]): SkillTrustLevel {
  if (sourceType === "built-in") return "trusted";
  if (sourceType === "project") return "project";
  if (sourceType === "global") return "community";
  return "unknown";
}

function inferPermissionsFromText(content: string, tools: string[]): string[] {
  const haystack = `${content}\n${tools.join("\n")}`.toLowerCase();
  const permissions = new Set<string>();

  if (/\b(shell|command|bash|powershell|terminal|exec|run)\b/.test(haystack)) permissions.add("shell");
  if (/\b(write|edit|create|delete|remove|filesystem|file)\b/.test(haystack)) permissions.add("write");
  if (/\b(web|http|https|browser|fetch|curl|network|api)\b/.test(haystack)) permissions.add("network");
  if (/\b(git|github|commit|push|pull request|pr)\b/.test(haystack)) permissions.add("git");
  if (/\b(secret|token|api key|apikey|credential|password|env)\b/.test(haystack)) permissions.add("secrets");
  if (/\b(docker|container)\b/.test(haystack)) permissions.add("docker");

  return Array.from(permissions);
}
