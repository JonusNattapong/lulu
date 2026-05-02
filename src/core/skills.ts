import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

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
  content: string; // Full markdown content
  source: string; // File path or built-in
}

export interface SkillResult {
  skill: Skill;
  score: number;
  matchedTriggers: string[];
}

const SKILL_CACHE_TTL = 60_000; // 1 minute
let skillCache: { skills: Skill[]; timestamp: number } | null = null;

export function getGlobalSkillDir(): string {
  return path.join(homedir(), ".lulu", "skills");
}

export function getProjectSkillDir(projectRoot: string): string {
  return path.join(projectRoot, "skills");
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

  return result;
}

export function loadSkillFile(filePath: string): Skill | null {
  try {
    const content = readFileSync(filePath, "utf-8");
    const parsed = parseSkillFrontmatter(content);

    return {
      name: parsed.name || path.basename(path.dirname(filePath)),
      version: parsed.version || "1.0.0",
      description: parsed.description || "",
      triggers: parsed.triggers || [],
      category: parsed.category || "general",
      qualityBar: parsed.qualityBar || "",
      steps: parsed.steps || [],
      tools: parsed.tools,
      scripts: parsed.scripts,
      dependencies: parsed.dependencies,
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

  // Return cached skills if fresh
  if (skillCache && now - skillCache.timestamp < SKILL_CACHE_TTL) {
    return skillCache.skills;
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

  // Cache the result
  skillCache = { skills, timestamp: now };

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
}): string {
  const skillDir = path.join(getGlobalSkillDir(), params.category, params.name);
  if (!existsSync(skillDir)) mkdirSync(skillDir, { recursive: true });

  const content = `---
name: ${params.name}
version: 1.0.0
description: ${params.description}
triggers: [${params.triggers.map((t) => `"${t}"`).join(", ")}]
category: ${params.category}
quality_bar: ${params.qualityBar}
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

  const skillPath = path.join(skillDir, "SKILL.md");
  writeFileSync(skillPath, content, "utf-8");

  // Invalidate cache
  skillCache = null;

  return skillPath;
}

// Skill file deletion
export function deleteSkill(skillName: string, category?: string): boolean {
  const skillDir = path.join(getGlobalSkillDir(), category || "custom", skillName);

  if (existsSync(skillDir)) {
    const { rmSync } = require("node:fs");
    rmSync(skillDir, { recursive: true });
    skillCache = null;
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
        skillCache = null;
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
}): string {
  return createSkill({
    name: params.name,
    description: params.description,
    triggers: params.triggers,
    category: params.category || "learned",
    qualityBar: "Successfully completed the workflow",
    steps: params.workflow.split("\n").filter(Boolean),
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

    // Extract source type
    const source = skill.source.includes(".lulu/skills")
      ? "global"
      : skill.source.includes("skills/")
        ? "built-in"
        : "project";
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

  lines.push("", `*Source: ${skill.source}*`);

  return lines.join("\n");
}