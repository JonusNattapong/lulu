import type { Tool } from "../registry.js";
import type { AgentConfig } from "../../types/types.js";
import { loadAllSkills, searchSkills, validateSkill } from "../../core/skills.js";

interface SkillAnalysis {
  valid: boolean;
  errors: string[];
  similar: string[];
  usage?: number;
}

interface CurationResult {
  analyzed: number;
  valid: number;
  invalid: number;
  similar: string[];
  suggestions: string[];
  removed: string[];
  optimized: number;
}

// Analyze a skill for curation
async function analyzeSkill(name: string, skills: any[]): Promise<SkillAnalysis> {
  const skill = skills.find((s) => s.name === name);
  if (!skill) {
    return { valid: false, errors: ["Skill not found"], similar: [] };
  }

  const validation = validateSkill(skill);
  if (!validation.valid) {
    return { valid: false, errors: validation.errors, similar: [] };
  }

  // Find similar skills
  const similar = searchSkills(
    skill.name + " " + skill.description,
    skills,
    3
  )
    .filter((r) => r.skill.name !== name && r.score > 0.5)
    .map((r) => r.skill.name);

  return {
    valid: true,
    errors: [],
    similar,
  };
}

// Find duplicate skills (same name or very similar)
function findDuplicates(skills: any[]): string[][] {
  const groups: string[][] = [];
  const processed = new Set<string>();

  for (const skill of skills) {
    if (processed.has(skill.name)) continue;

    const similar = skills.filter(
      (s) =>
        s.name !== skill.name &&
        !processed.has(s.name) &&
        (s.name.includes(skill.name) ||
          skill.name.includes(s.name) ||
          s.description === skill.description)
    );

    if (similar.length > 0) {
      groups.push([skill.name, ...similar.map((s) => s.name)]);
      processed.add(skill.name);
      similar.forEach((s) => processed.add(s.name));
    }
  }

  return groups;
}

// Merge similar skills
function mergeSkills(skills: any[], keep: string, remove: string[]): any {
  const keepSkill = skills.find((s) => s.name === keep);
  if (!keepSkill) return null;

  // Merge descriptions and triggers
  const merged = { ...keepSkill };
  for (const name of remove) {
    const skill = skills.find((s) => s.name === name);
    if (skill) {
      // Add unique triggers
      const existingTriggers = new Set(merged.triggers || []);
      (skill.triggers || []).forEach((t: string) => existingTriggers.add(t));
      merged.triggers = Array.from(existingTriggers);

      // Append to steps
      if (skill.steps?.length) {
        merged.steps = [...(merged.steps || []), ...skill.steps];
      }
    }
  }

  return merged;
}

// Main curation function
async function curateSkills(
  config: AgentConfig,
  options: {
    dryRun?: boolean;
    autoMerge?: boolean;
    removeDuplicates?: boolean;
    fixInvalid?: boolean;
  } = {}
): Promise<CurationResult> {
  const projectRoot = config.projectRoot || process.cwd();
  const skills = loadAllSkills(projectRoot);

  const result: CurationResult = {
    analyzed: skills.length,
    valid: 0,
    invalid: 0,
    similar: [],
    suggestions: [],
    removed: [],
    optimized: 0,
  };

  // 1. Analyze each skill
  const analysis: Map<string, SkillAnalysis> = new Map();
  for (const skill of skills) {
    const analysis_1 = await analyzeSkill(skill.name, skills);
    analysis.set(skill.name, analysis_1);
    if (analysis_1.valid) {
      result.valid++;
    } else {
      result.invalid++;
      result.suggestions.push(
        `Fix "${skill.name}": ${analysis_1.errors.join(", ")}`
      );
    }
  }

  // 2. Find duplicates
  const duplicates = findDuplicates(skills);
  if (duplicates.length > 0) {
    for (const group of duplicates) {
      result.similar.push(...group);
      result.suggestions.push(
        `Duplicate group: ${group.join(", ")}. Consider merging.`
      );
    }
  }

  // 3. Find orphaned skills (no triggers)
  for (const skill of skills) {
    if (!skill.triggers?.length) {
      result.suggestions.push(
        `Skill "${skill.name}" has no triggers and may never be activated.`
      );
    }
  }

  // 4. Find skills with very long steps
  for (const skill of skills) {
    if (skill.steps?.length > 20) {
      result.suggestions.push(
        `Skill "${skill.name}" has ${skill.steps.length} steps. Consider splitting into smaller skills.`
      );
    }
  }

  // Auto-fix if enabled
  if (options.fixInvalid && !options.dryRun) {
    let fixed = 0;
    for (const skill of skills) {
      const a = analysis.get(skill.name);
      if (!a?.valid && a?.errors.includes("Missing triggers")) {
        // Auto-add default trigger from name
        skill.triggers = [skill.name, ...skill.name.split(/[-_]/)];
        fixed++;
      }
    }
    result.optimized += fixed;
    if (fixed > 0) {
      result.suggestions.push(`Auto-fixed ${fixed} skills.`);
    }
  }

  return result;
}

// Format curation report
function formatCurationReport(result: CurationResult): string {
  const lines = [
    "## Skill Curation Report",
    "",
    `**Analyzed:** ${result.analyzed} skills`,
    `**Valid:** ${result.valid}`,
    `**Invalid:** ${result.invalid}`,
    "",
  ];

  if (result.suggestions.length > 0) {
    lines.push("### Suggestions");
    for (const s of result.suggestions) {
      lines.push(`- ${s}`);
    }
    lines.push("");
  }

  if (result.removed.length > 0) {
    lines.push("### Removed");
    for (const r of result.removed) {
      lines.push(`- ~~${r}~~`);
    }
    lines.push("");
  }

  lines.push(`**Auto-optimized:** ${result.optimized} skills`);

  return lines.join("\n");
}

export const curationTools: Tool[] = [
  {
    name: "curate_skills",
    category: "skills",
    description: "Analyze and optimize the skill library. Removes duplicates, fixes invalid skills, and suggests improvements.",
    risk: "low",
    input_schema: {
      type: "object",
      properties: {
        dry_run: {
          type: "boolean",
          description: "If true, only analyze without making changes",
        },
        auto_merge: {
          type: "boolean",
          description: "Automatically merge duplicate skills",
        },
        remove_duplicates: {
          type: "boolean",
          description: "Remove duplicate skills",
        },
        fix_invalid: {
          type: "boolean",
          description: "Automatically fix invalid skills where possible",
        },
      },
    },
    execute: async (input, config) => {
      const options = {
        dryRun: input.dry_run ?? false,
        autoMerge: input.auto_merge ?? false,
        removeDuplicates: input.remove_duplicates ?? false,
        fixInvalid: input.fix_invalid ?? false,
      };

      try {
        const result = await curateSkills(config, options);
        return formatCurationReport(result);
      } catch (err: any) {
        return `Curation failed: ${err.message}`;
      }
    },
  },
  {
    name: "list_skills",
    category: "skills",
    description: "List all available skills with their categories and descriptions.",
    risk: "low",
    input_schema: {
      type: "object",
      properties: {
        category: {
          type: "string",
          description: "Filter by category",
        },
        show_invalid: {
          type: "boolean",
          description: "Include invalid/skipped skills",
        },
      },
    },
    execute: async (input, config) => {
      const projectRoot = config.projectRoot || process.cwd();
      const skills = loadAllSkills(projectRoot);

      let filtered = skills;
      if (input.category) {
        filtered = skills.filter((s) => s.category === input.category);
      }

      const lines = [
        `## Available Skills (${filtered.length})`,
        "",
      ];

      const byCategory: Record<string, typeof filtered> = {};
      for (const skill of filtered) {
        if (!byCategory[skill.category]) byCategory[skill.category] = [];
        byCategory[skill.category].push(skill);
      }

      for (const [category, catSkills] of Object.entries(byCategory).sort()) {
        lines.push(`### ${category} (${catSkills.length})`);
        for (const skill of catSkills) {
          lines.push(`- **${skill.name}**: ${skill.description}`);
        }
        lines.push("");
      }

      return lines.join("\n");
    },
  },
  {
    name: "delete_skill",
    category: "skills",
    description: "Delete a skill from the library.",
    risk: "high",
    permissions: ["write"],
    input_schema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Name of the skill to delete",
        },
        confirm: {
          type: "boolean",
          description: "Must be true to confirm deletion",
        },
      },
      required: ["name", "confirm"],
    },
    execute: async (input, config) => {
      if (!input.confirm) {
        return "Deletion cancelled. Set confirm=true to delete.";
      }

      const { existsSync, rmSync } = await import("node:fs");
      const { getGlobalSkillDir } = await import("../../core/skills.js");
      const { homedir } = await import("node:os");
      const path = await import("node:path");

      // Find skill directory
      const skillDir = path.join(getGlobalSkillDir(), input.name);
      const altDir = path.join(
        homedir(),
        ".lulu",
        "skills",
        input.category || "general",
        input.name
      );

      let targetDir = skillDir;
      if (!existsSync(targetDir)) {
        targetDir = altDir;
      }

      if (!existsSync(targetDir)) {
        return `Skill not found: ${input.name}`;
      }

      try {
        rmSync(targetDir, { recursive: true });
        return `Deleted skill: ${input.name}`;
      } catch (err: any) {
        return `Failed to delete: ${err.message}`;
      }
    },
  },
  {
    name: "merge_skills",
    category: "skills",
    description: "Merge multiple skills into one.",
    risk: "medium",
    permissions: ["write"],
    input_schema: {
      type: "object",
      properties: {
        keep: {
          type: "string",
          description: "Skill name to keep",
        },
        merge: {
          type: "array",
          items: { type: "string" },
          description: "Skill names to merge into the kept skill",
        },
      },
      required: ["keep", "merge"],
    },
    execute: async (input, config) => {
      const projectRoot = config.projectRoot || process.cwd();
      const skills = loadAllSkills(projectRoot);

      const keepSkill = skills.find((s) => s.name === input.keep);
      if (!keepSkill) {
        return `Skill not found: ${input.keep}`;
      }

      const merged = mergeSkills(skills, input.keep, input.merge);
      if (!merged) {
        return "Merge failed";
      }

      // Save merged skill
      const { createSkill } = await import("../../core/skills.js");
      const path = await import("node:path");
      const skillPath = createSkill({
        name: merged.name,
        description: merged.description,
        triggers: merged.triggers,
        category: merged.category,
        qualityBar: merged.qualityBar || "",
        steps: merged.steps || [],
      });

      // Delete merged skills
      const { deleteSkill } = await import("../../core/skills.js");
      const { existsSync, rmSync } = await import("node:fs");
      const { getGlobalSkillDir } = await import("../../core/skills.js");

      for (const name of input.merge) {
        const skillDir = path.join(getGlobalSkillDir(), merged.category, name);
        if (existsSync(skillDir)) {
          rmSync(skillDir, { recursive: true });
        }
      }

      return `Merged ${input.merge.length} skills into ${input.keep}\nSaved to: ${skillPath}`;
    },
  },
];