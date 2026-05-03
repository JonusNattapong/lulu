/**
 * Skill Improvement System
 * Adds a review/evaluate/improve/version loop on top of skill proposal + skillify.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { clearSkillCache, loadAllSkills, parseSkillFrontmatter, validateSkill, type Skill } from "./skills.js";
import { eventBus } from "./events.js";

const VERSION_STORE_PATH = path.join(homedir(), ".lulu", "skill-versions.json");
const SNAPSHOT_DIR = path.join(homedir(), ".lulu", "skill-versions");

export interface SkillReviewFinding {
  severity: "info" | "warning" | "error";
  message: string;
}

export interface SkillEvaluation {
  skillName: string;
  score: number;
  grade: "excellent" | "good" | "needs-work" | "broken";
  findings: SkillReviewFinding[];
  recommendations: string[];
}

export interface SkillVersionRecord {
  id: string;
  skillName: string;
  previousVersion: string;
  newVersion: string;
  source: string;
  snapshotPath: string;
  reason: string;
  changes: string[];
  createdAt: string;
}

interface SkillVersionStore {
  versions: SkillVersionRecord[];
}

export interface SkillImprovementResult {
  skillName: string;
  applied: boolean;
  previousVersion: string;
  newVersion: string;
  source: string;
  proposedContent: string;
  version?: SkillVersionRecord;
  evaluation: SkillEvaluation;
}

const DEFAULT_VERSION_STORE: SkillVersionStore = { versions: [] };

function loadVersionStore(): SkillVersionStore {
  mkdirSync(path.dirname(VERSION_STORE_PATH), { recursive: true });
  if (!existsSync(VERSION_STORE_PATH)) {
    writeFileSync(VERSION_STORE_PATH, JSON.stringify(DEFAULT_VERSION_STORE, null, 2), "utf-8");
    return { ...DEFAULT_VERSION_STORE };
  }

  try {
    return {
      ...DEFAULT_VERSION_STORE,
      ...JSON.parse(readFileSync(VERSION_STORE_PATH, "utf-8")),
    };
  } catch {
    return { ...DEFAULT_VERSION_STORE };
  }
}

function saveVersionStore(store: SkillVersionStore): void {
  mkdirSync(path.dirname(VERSION_STORE_PATH), { recursive: true });
  writeFileSync(VERSION_STORE_PATH, JSON.stringify(store, null, 2), "utf-8");
}

function findSkill(skillName: string, projectRoot?: string): Skill | null {
  const skills = loadAllSkills(projectRoot);
  return skills.find((s) => s.name.toLowerCase() === skillName.toLowerCase()) ?? null;
}

function bumpPatchVersion(version: string): string {
  const parts = version.split(".").map((part) => Number.parseInt(part, 10));
  const [major, minor, patch] = [
    Number.isFinite(parts[0]) ? parts[0] : 1,
    Number.isFinite(parts[1]) ? parts[1] : 0,
    Number.isFinite(parts[2]) ? parts[2] : 0,
  ];
  return `${major}.${minor}.${patch + 1}`;
}

function yamlArray(items: string[]): string {
  return `[${items.map((item) => `"${item.replace(/"/g, '\\"')}"`).join(", ")}]`;
}

function splitFrontmatter(content: string): { frontmatter: string | null; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { frontmatter: null, body: content.trim() };
  return { frontmatter: match[1], body: match[2].trim() };
}

function setFrontmatterValue(frontmatter: string, key: string, value: string): string {
  const lines = frontmatter.split("\n");
  const index = lines.findIndex((line) => line.trim().startsWith(`${key}:`));
  const nextLine = `${key}: ${value}`;
  if (index >= 0) {
    lines[index] = nextLine;
  } else {
    lines.push(nextLine);
  }
  return lines.join("\n");
}

function buildFrontmatter(skill: Skill, version: string): string {
  return [
    `name: ${skill.name}`,
    `version: ${version}`,
    `description: ${skill.description || `Workflow skill: ${skill.name}`}`,
    `triggers: ${yamlArray(skill.triggers.length ? skill.triggers : [skill.name])}`,
    `category: ${skill.category || "general"}`,
    `quality_bar: ${skill.qualityBar || "Task completed successfully and verified"}`,
  ].join("\n");
}

function ensureSection(body: string, heading: string, content: string): { body: string; changed: boolean } {
  const pattern = new RegExp(`^##\\s+${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "im");
  if (pattern.test(body)) return { body, changed: false };
  const separator = body.trim() ? "\n\n" : "";
  return { body: `${body.trim()}${separator}## ${heading}\n${content.trim()}\n`, changed: true };
}

function normalizeSteps(skill: Skill): string {
  if (skill.steps.length) {
    return skill.steps.map((step, index) => `${index + 1}. ${step.replace(/^\d+[\.\)]\s*/, "")}`).join("\n");
  }
  return [
    "1. Clarify the task and expected output.",
    "2. Run the workflow using the listed triggers and tools.",
    "3. Verify the result against the quality bar.",
    "4. Capture any lessons for the next version.",
  ].join("\n");
}

export function evaluateSkill(skill: Skill): SkillEvaluation {
  const findings: SkillReviewFinding[] = [];
  const recommendations: string[] = [];
  const validation = validateSkill(skill);
  let score = 100;

  for (const error of validation.errors) {
    findings.push({ severity: "error", message: error });
    recommendations.push(`Fix: ${error}.`);
    score -= 18;
  }

  if (skill.triggers.length < 2) {
    findings.push({ severity: "warning", message: "Skill has fewer than two triggers." });
    recommendations.push("Add trigger phrases that match how the user naturally asks for this workflow.");
    score -= 10;
  }

  if (skill.steps.length < 3) {
    findings.push({ severity: "warning", message: "Skill has fewer than three workflow steps." });
    recommendations.push("Expand the workflow into concrete, ordered steps.");
    score -= 14;
  }

  if (!skill.qualityBar) {
    findings.push({ severity: "warning", message: "Skill has no quality bar." });
    recommendations.push("Define what a successful run must verify before completion.");
    score -= 12;
  }

  if (skill.content.length > 6000) {
    findings.push({ severity: "warning", message: "Skill content is long and may be hard to retrieve efficiently." });
    recommendations.push("Split large workflows into smaller focused skills or move details into referenced files.");
    score -= 8;
  }

  if (!/##\s*(When to use|Use when|Triggers|Steps|Quality Bar)/i.test(skill.content)) {
    findings.push({ severity: "info", message: "Skill would benefit from standard operating sections." });
    recommendations.push("Add When to use, Steps, and Quality Bar sections for reviewability.");
    score -= 5;
  }

  const boundedScore = Math.max(0, Math.min(100, score));
  const grade =
    boundedScore >= 90 ? "excellent" :
      boundedScore >= 75 ? "good" :
        boundedScore >= 50 ? "needs-work" :
          "broken";

  if (findings.length === 0) {
    findings.push({ severity: "info", message: "No structural issues found." });
  }

  return {
    skillName: skill.name,
    score: boundedScore,
    grade,
    findings,
    recommendations,
  };
}

export function reviewSkill(skillName: string, projectRoot?: string): SkillEvaluation | null {
  const skill = findSkill(skillName, projectRoot);
  if (!skill) return null;
  return evaluateSkill(skill);
}

export function improveSkill(params: {
  skillName: string;
  projectRoot?: string;
  notes?: string;
  apply?: boolean;
}): SkillImprovementResult | null {
  const skill = findSkill(params.skillName, params.projectRoot);
  if (!skill) return null;

  const originalContent = readFileSync(skill.source, "utf-8");
  const parsed = parseSkillFrontmatter(originalContent);
  const previousVersion = parsed.version || skill.version || "1.0.0";
  const newVersion = bumpPatchVersion(previousVersion);
  const split = splitFrontmatter(originalContent);

  let frontmatter = split.frontmatter ?? buildFrontmatter(skill, newVersion);
  frontmatter = setFrontmatterValue(frontmatter, "version", newVersion);
  if (!split.frontmatter) {
    frontmatter = buildFrontmatter(skill, newVersion);
  }

  let body = split.body || `# ${skill.name}\n\n## Overview\n${skill.description}`;
  const changes: string[] = [`Bumped version ${previousVersion} -> ${newVersion}`];

  const steps = ensureSection(body, "Steps", normalizeSteps(skill));
  body = steps.body;
  if (steps.changed) changes.push("Added Steps section");

  const quality = ensureSection(
    body,
    "Quality Bar",
    skill.qualityBar || "The workflow is complete, verified, and reported with any follow-up risks."
  );
  body = quality.body;
  if (quality.changed) changes.push("Added Quality Bar section");

  const usage = ensureSection(
    body,
    "When to use",
    `Use this skill when the user asks for ${skill.description || skill.name}.`
  );
  body = usage.body;
  if (usage.changed) changes.push("Added When to use section");

  if (params.notes?.trim()) {
    const stamp = new Date().toISOString();
    body = `${body.trim()}\n\n## Improvement Notes\n- ${stamp}: ${params.notes.trim()}\n`;
    changes.push("Recorded improvement notes");
  }

  const proposedContent = `---\n${frontmatter}\n---\n\n${body.trim()}\n`;
  const evaluation = evaluateSkill({
    ...skill,
    version: newVersion,
    content: splitFrontmatter(proposedContent).body,
    ...parseSkillFrontmatter(proposedContent),
  });

  if (!params.apply) {
    return {
      skillName: skill.name,
      applied: false,
      previousVersion,
      newVersion,
      source: skill.source,
      proposedContent,
      evaluation,
    };
  }

  mkdirSync(SNAPSHOT_DIR, { recursive: true });
  const id = `skill-version-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const snapshotPath = path.join(SNAPSHOT_DIR, `${skill.name}-${previousVersion}-${id}.md`);
  writeFileSync(snapshotPath, originalContent, "utf-8");
  writeFileSync(skill.source, proposedContent, "utf-8");
  clearSkillCache();

  const version: SkillVersionRecord = {
    id,
    skillName: skill.name,
    previousVersion,
    newVersion,
    source: skill.source,
    snapshotPath,
    reason: params.notes || "Skill improvement",
    changes,
    createdAt: new Date().toISOString(),
  };

  const store = loadVersionStore();
  store.versions.push(version);
  saveVersionStore(store);

  eventBus.emit("skill:improved", {
    id,
    name: skill.name,
    previousVersion,
    newVersion,
    source: skill.source,
  });

  return {
    skillName: skill.name,
    applied: true,
    previousVersion,
    newVersion,
    source: skill.source,
    proposedContent,
    version,
    evaluation,
  };
}

export function listSkillVersions(skillName?: string): SkillVersionRecord[] {
  const store = loadVersionStore();
  return store.versions
    .filter((version) => !skillName || version.skillName.toLowerCase() === skillName.toLowerCase())
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function formatSkillEvaluation(evaluation: SkillEvaluation): string {
  return [
    `## Skill Review: ${evaluation.skillName}`,
    "",
    `**Score:** ${evaluation.score}/100 (${evaluation.grade})`,
    "",
    "**Findings:**",
    ...evaluation.findings.map((finding) => `- ${finding.severity}: ${finding.message}`),
    "",
    "**Recommendations:**",
    ...(evaluation.recommendations.length ? evaluation.recommendations.map((rec) => `- ${rec}`) : ["- No recommendations."]),
  ].join("\n");
}
