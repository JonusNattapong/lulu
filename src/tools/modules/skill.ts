import type { Tool } from "../registry.js";
import type { AgentConfig } from "../../types/types.js";
import { loadAllSkills, searchSkills, createSkill, skillify, getSkillStats, previewSkill, summarizeSkillLibrary } from "../../core/skills.js";
import { formatSkillEvaluation, improveSkill, listSkillVersions, reviewSkill } from "../../core/skill-improvement.js";
import { getBrain } from "../../core/brain.js";

// Helper to execute tool logic
async function executeSkillSearchTool(input: any, config: AgentConfig): Promise<string> {
  const { query, limit = 5 } = input;
  const projectRoot = config.projectRoot || process.cwd();

  const skills = loadAllSkills(projectRoot);
  const results = searchSkills(query, skills, limit);

  if (results.length === 0) {
    return `No skills found for: "${query}"\n\nTip: Try /skills create to create a new skill.`;
  }

  const lines = [
    `Found ${results.length} relevant skills:`,
    "",
    ...results.map(
      (r) => `**${r.skill.name}** (${r.skill.category})
  ${r.skill.description}
  Triggers: ${r.skill.triggers.join(", ")}
  Match: ${r.matchedTriggers.length > 0 ? r.matchedTriggers.join(", ") : "description"}`
    ),
  ];

  return lines.join("\n");
}

async function executeSkillListTool(input: any, config: AgentConfig): Promise<string> {
  const { category, include_safety = false } = input;
  const projectRoot = config.projectRoot || process.cwd();

  const skills = loadAllSkills(projectRoot);
  const stats = getSkillStats(skills);

  if (include_safety) {
    return summarizeSkillLibrary(category ? skills.filter((s) => s.category === category) : skills);
  }

  if (category) {
    const filtered = skills.filter((s) => s.category === category);
    return [
      `Skills in ${category}:`,
      "",
      ...filtered.map((s) => `- ${s.name}: ${s.description}`),
      "",
      `Total: ${filtered.length}`,
    ].join("\n");
  }

  return [
    `All Skills (${stats.total})`,
    "",
    Object.entries(stats.byCategory)
      .map(([cat, count]) => `${cat}: ${count} skills`)
      .join("\n"),
    "",
    "Use /skills list to see all skills in detail.",
  ].join("\n");
}

async function executeSkillCreateTool(input: any, config: AgentConfig): Promise<string> {
  const { name, description, triggers, category = "general", steps, quality_bar, dry_run = false, permissions = [], trust_level } = input;

  try {
    const params = {
      name,
      description,
      triggers,
      category,
      qualityBar: quality_bar || "Task completed successfully",
      steps,
      permissions,
      trustLevel: trust_level,
      auditContext: {
        projectName: config.projectName,
        channel: config.channel,
      },
    };

    if (dry_run) {
      return previewSkill(params);
    }

    const path = createSkill(params);

    return `Created skill: ${name}\nLocation: ${path}`;
  } catch (err: any) {
    return `Failed to create skill: ${err.message}`;
  }
}

async function executeSkillCaptureTool(input: any, config: AgentConfig): Promise<string> {
  const { name, workflow, triggers = [], dry_run = false, permissions = [], trust_level } = input;

  try {
    if (dry_run) {
      return previewSkill({
        name,
        description: `Captured workflow: ${name}`,
        triggers: [name, ...triggers],
        category: "learned",
        qualityBar: "Successfully completed the workflow",
        steps: workflow.split("\n").filter(Boolean),
        permissions,
        trustLevel: trust_level,
      });
    }

    const path = skillify({
      name,
      description: `Captured workflow: ${name}`,
      workflow,
      triggers: [name, ...triggers],
      permissions,
      trustLevel: trust_level,
      auditContext: {
        projectName: config.projectName,
        channel: config.channel,
      },
    });

    return `Captured skill: ${name}\nLocation: ${path}`;
  } catch (err: any) {
    return `Failed to capture skill: ${err.message}`;
  }
}

async function executeSkillReviewTool(input: any, config: AgentConfig): Promise<string> {
  const { name } = input;
  const evaluation = reviewSkill(name, config.projectRoot || process.cwd());

  if (!evaluation) {
    return `Skill not found: ${name}`;
  }

  return formatSkillEvaluation(evaluation);
}

async function executeSkillImproveTool(input: any, config: AgentConfig): Promise<string> {
  const { name, notes, apply = false } = input;
  const result = improveSkill({
    skillName: name,
    projectRoot: config.projectRoot || process.cwd(),
    notes,
    apply,
  });

  if (!result) {
    return `Skill not found: ${name}`;
  }

  const lines = [
    `Skill improvement: ${result.skillName}`,
    `Applied: ${result.applied ? "yes" : "no"}`,
    `Version: ${result.previousVersion} -> ${result.newVersion}`,
    `Source: ${result.source}`,
    "",
    formatSkillEvaluation(result.evaluation),
  ];

  if (result.version) {
    lines.push("", `Snapshot: ${result.version.snapshotPath}`);
  } else {
    lines.push("", "Set apply=true to write the improved skill and record a version snapshot.");
  }

  return lines.join("\n");
}

async function executeSkillVersionsTool(input: any): Promise<string> {
  const versions = listSkillVersions(input.name);

  if (versions.length === 0) {
    return input.name ? `No versions recorded for: ${input.name}` : "No skill versions recorded yet.";
  }

  return [
    `Skill versions${input.name ? ` for ${input.name}` : ""}:`,
    "",
    ...versions.map((version) =>
      `- ${version.skillName} ${version.previousVersion} -> ${version.newVersion} (${version.createdAt})\n  ${version.reason}\n  Snapshot: ${version.snapshotPath}`
    ),
  ].join("\n");
}

async function executeBrainQueryTool(input: any, config: AgentConfig): Promise<string> {
  const { query, limit = 5 } = input;
  const projectName = config.projectName || "default";

  try {
    const brain = new (await import("../../core/brain.js")).Brain(projectName);
    const results = await brain.hybridSearch(config, query, { limit });

    if (results.length === 0) {
      return `No results found for: "${query}"`;
    }

    const lines = [
      `Found ${results.length} results:`,
      "",
      ...results.map(
        (r, i) => `**${i + 1}. ${r.page.title}** (${(r.score * 100).toFixed(0)}%)
Source: ${r.source || "brain"}${r.sourcePath ? ` (${r.sourcePath})` : ""}
${r.page.content.slice(0, 300)}${r.page.content.length > 300 ? "..." : ""}`
      ),
    ];

    return lines.join("\n");
  } catch (err: any) {
    return `Brain query failed: ${err.message}`;
  }
}

async function executeBrainIngestTool(input: any, config: AgentConfig): Promise<string> {
  const { title, content, tags = [] } = input;
  const projectName = config.projectName || "default";

  try {
    const brain = new (await import("../../core/brain.js")).Brain(projectName);
    const page = await brain.createPage({ title, content, tags });

    // Also detect and link entities
    const entities = await brain.detectEntities(content);
    if (entities.length > 0) {
      await brain.linkPageToEntities(page.slug, entities.map((e) => e.id));
    }

    return `Created brain page: ${page.slug}\nEntities detected: ${entities.length}`;
  } catch (err: any) {
    return `Failed to ingest: ${err.message}`;
  }
}

async function executeBrainEnrichTool(input: any, config: AgentConfig): Promise<string> {
  const { content } = input;
  const projectName = config.projectName || "default";

  try {
    const brain = new (await import("../../core/brain.js")).Brain(projectName);
    const entities = await brain.detectEntities(content);

    const lines = [
      `Detected ${entities.length} entities:`,
      "",
      ...entities.map((e) => `- **${e.name}** (${e.type}) - ${e.mentionCount} mentions`),
    ];

    return lines.join("\n");
  } catch (err: any) {
    return `Failed to enrich: ${err.message}`;
  }
}

export const skillTools: Tool[] = [
  {
    name: "skill_search",
    category: "skills",
    description: "Search for relevant skills based on a query. Use when user asks about specific tasks or workflows.",
    risk: "low",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query to find relevant skills",
        },
        limit: {
          type: "number",
          description: "Maximum number of results (default: 5)",
        },
      },
      required: ["query"],
    },
    execute: executeSkillSearchTool,
  },
  {
    name: "skill_list",
    category: "skills",
    description: "List all available skills, optionally filtered by category.",
    risk: "low",
    input_schema: {
      type: "object",
      properties: {
        category: {
          type: "string",
          description: "Filter by category (optional)",
        },
        include_safety: {
          type: "boolean",
          description: "Return trust levels, inferred permissions, and warnings instead of the normal list",
        },
      },
    },
    execute: executeSkillListTool,
  },
  {
    name: "skill_create",
    category: "skills",
    description: "Create a new skill from a description. Use after successful workflows that could be reusable.",
    risk: "medium",
    permissions: ["write"],
    input_schema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Skill name (kebab-case recommended)",
        },
        description: {
          type: "string",
          description: "One-line description of what the skill does",
        },
        triggers: {
          type: "array",
          items: { type: "string" },
          description: "Keywords or phrases that activate this skill",
        },
        category: {
          type: "string",
          description: "Category (git, web, code, research, tasks, setup, general)",
        },
        steps: {
          type: "array",
          items: { type: "string" },
          description: "Workflow steps",
        },
        quality_bar: {
          type: "string",
          description: "What success looks like",
        },
        dry_run: {
          type: "boolean",
          description: "Preview the skill and permission summary without writing files",
        },
        permissions: {
          type: "array",
          items: { type: "string" },
          description: "Declared permissions such as shell, write, network, git, secrets, docker",
        },
        trust_level: {
          type: "string",
          description: "Trust level: trusted, project, community, or unknown",
        },
      },
      required: ["name", "description", "triggers", "steps"],
    },
    execute: executeSkillCreateTool,
  },
  {
    name: "skill_capture",
    category: "skills",
    description: "Capture a successful workflow as a skill for future reuse.",
    risk: "low",
    input_schema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Name for the captured skill",
        },
        workflow: {
          type: "string",
          description: "Description of the workflow steps taken",
        },
        triggers: {
          type: "array",
          items: { type: "string" },
          description: "Trigger keywords",
        },
        dry_run: {
          type: "boolean",
          description: "Preview the captured skill and permission summary without writing files",
        },
        permissions: {
          type: "array",
          items: { type: "string" },
          description: "Declared permissions such as shell, write, network, git, secrets, docker",
        },
        trust_level: {
          type: "string",
          description: "Trust level: trusted, project, community, or unknown",
        },
      },
      required: ["name", "workflow"],
    },
    execute: executeSkillCaptureTool,
  },
  {
    name: "skill_review",
    category: "skills",
    description: "Review and score a skill for completeness, trigger quality, workflow steps, and quality bar.",
    risk: "low",
    input_schema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Skill name to review",
        },
      },
      required: ["name"],
    },
    execute: executeSkillReviewTool,
  },
  {
    name: "skill_improve",
    category: "skills",
    description: "Propose or apply an improved version of a skill with version snapshot history.",
    risk: "medium",
    permissions: ["write"],
    input_schema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Skill name to improve",
        },
        notes: {
          type: "string",
          description: "Reason or review notes to record with the improvement",
        },
        apply: {
          type: "boolean",
          description: "When true, write the improved SKILL.md and record a version snapshot. Defaults to false.",
        },
      },
      required: ["name"],
    },
    execute: executeSkillImproveTool,
  },
  {
    name: "skill_versions",
    category: "skills",
    description: "List recorded skill version history, optionally for one skill.",
    risk: "low",
    input_schema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Optional skill name filter",
        },
      },
    },
    execute: executeSkillVersionsTool,
  },
  {
    name: "brain_query",
    category: "brain",
    description: "Query the knowledge brain for relevant context from previous sessions.",
    risk: "low",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query for the brain",
        },
        limit: {
          type: "number",
          description: "Maximum results (default: 5)",
        },
      },
      required: ["query"],
    },
    execute: executeBrainQueryTool,
  },
  {
    name: "brain_ingest",
    category: "brain",
    description: "Add new content to the knowledge brain.",
    risk: "medium",
    permissions: ["write"],
    input_schema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Page title",
        },
        content: {
          type: "string",
          description: "Content to store",
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Tags for organization",
        },
      },
      required: ["title", "content"],
    },
    execute: executeBrainIngestTool,
  },
  {
    name: "brain_enrich",
    category: "brain",
    description: "Extract and link entities (people, companies) from content.",
    risk: "low",
    input_schema: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description: "Content to extract entities from",
        },
      },
      required: ["content"],
    },
    execute: executeBrainEnrichTool,
  },
];
