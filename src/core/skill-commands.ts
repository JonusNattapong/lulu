import type { CommandContext, CommandResult } from "./commands.js";
import { loadAllSkills, searchSkills, listCategories, getSkillStats, formatSkill, createSkill, skillify, previewSkill, summarizeSkillLibrary } from "./skills.js";
import { formatSkillEvaluation, improveSkill, listSkillVersions, reviewSkill } from "./skill-improvement.js";
import { getResolver } from "./resolver.js";

// Skill commands registration - called after commands module is loaded
export async function registerSkillCommands() {
  const { commandRegistry } = await import("./commands.js");
  const { getBrain } = await import("./brain.js");

  // Skills command
  commandRegistry.register({
    name: "skills",
    description: "Manage and search skills: /skills list, search, show, create",
    execute: async (args, context): Promise<CommandResult> => {
      const sub = args[0]?.toLowerCase();
      const projectRoot = context.config.projectRoot || process.cwd();

      switch (sub) {
        case "list": {
          const skills = loadAllSkills(projectRoot);
          const stats = getSkillStats(skills);

          const lines = [
            `## Lulu Skills (${stats.total} total)`,
            "",
            `**By Category:**`,
            ...Object.entries(stats.byCategory).map(([cat, count]) => `  - ${cat}: ${count}`),
            "",
            `**By Source:**`,
            ...Object.entries(stats.bySource).map(([src, count]) => `  - ${src}: ${count}`),
            "",
            "**Categories:**",
            listCategories(skills).join(", "),
            "",
            "**Skills:**",
            ...skills.map((s) => `- \`${s.name}\` (${s.category}) - ${s.description}`),
          ];

          return { text: lines.join("\n") };
        }

        case "search": {
          const query = args.slice(1).join(" ");
          if (!query) return { text: "Usage: /skills search <query>" };

          const skills = loadAllSkills(projectRoot);
          const results = searchSkills(query, skills, 10);

          if (results.length === 0) {
            return { text: `No skills found for: "${query}"` };
          }

          const lines = [
            `## Skills matching: "${query}"`,
            "",
            ...results.map(
              (r) =>
                `- **${r.skill.name}** (${r.skill.category}) - Score: ${r.score.toFixed(2)}\n  ${r.skill.description}`
            ),
          ];

          return { text: lines.join("\n") };
        }

        case "show": {
          const skillName = args[1];
          if (!skillName) return { text: "Usage: /skills show <name>" };

          const skills = loadAllSkills(projectRoot);
          const skill = skills.find(
            (s) => s.name.toLowerCase() === skillName.toLowerCase()
          );

          if (!skill) return { text: `Skill not found: ${skillName}` };

          return { text: formatSkill(skill), data: skill };
        }

        case "safety": {
          const skills = loadAllSkills(projectRoot);
          return { text: summarizeSkillLibrary(skills), data: skills.map((skill) => skill.permissionSummary) };
        }

        case "categories": {
          const skills = loadAllSkills(projectRoot);
          const cats = listCategories(skills);

          const lines = [
            `## Skill Categories (${cats.length})`,
            "",
            ...cats.map((cat) => {
              const catSkills = skills.filter((s) => s.category === cat);
              return [
                `### ${cat} (${catSkills.length})`,
                ...catSkills.map((s) => `- \`${s.name}\` - ${s.description}`),
                "",
              ].join("\n");
            }),
          ];

          return { text: lines.join("\n") };
        }

        case "create": {
          const name = args[1];
          const description = args[2] || "No description";
          const dryRun = args.includes("--dry-run");
          const triggers = args.slice(3).filter((arg) => arg !== "--dry-run");

          if (!name) {
            return {
              text: `Usage: /skills create <name> [description] [triggers...] [--dry-run]

Example:
  /skills create my-skill "Does something useful" "useful" "help"
  /skills create my-skill "Does something useful" --dry-run`,
            };
          }

          const params = {
            name,
            description,
            triggers: triggers.length ? triggers : [name, ...name.split(/[-_]/)],
            category: "custom",
            qualityBar: "Task completed successfully",
            steps: [
              "1. Understand the task requirements",
              "2. Execute the necessary steps",
              "3. Verify the result",
              "4. Report completion",
            ],
            auditContext: {
              projectName: context.config.projectName,
              channel: context.config.channel,
            },
          };

          if (dryRun) {
            return { text: previewSkill(params) };
          }

          const path = createSkill(params);

          return { text: `Skill created: ${path}` };
        }

        case "resolve": {
          const query = args.slice(1).join(" ");
          if (!query) return { text: "Usage: /skills resolve <query>" };

          const skills = loadAllSkills(projectRoot);
          const resolver = getResolver();
          const result = resolver.resolve(query, skills);

          if (!result) {
            return { text: `No skill found for: "${query}"` };
          }

          return {
            text: `**Resolved:** ${result.skill.name} (confidence: ${(result.confidence * 100).toFixed(0)}%)

${formatSkill(result.skill)}`,
            data: result,
          };
        }

        case "review":
        case "evaluate": {
          const skillName = args[1];
          if (!skillName) return { text: `Usage: /skills ${sub} <name>` };

          const evaluation = reviewSkill(skillName, projectRoot);
          if (!evaluation) return { text: `Skill not found: ${skillName}` };

          return { text: formatSkillEvaluation(evaluation), data: evaluation };
        }

        case "improve": {
          const skillName = args[1];
          if (!skillName) {
            return { text: "Usage: /skills improve <name> [--apply] [notes...]" };
          }

          const apply = args.includes("--apply");
          const notes = args
            .slice(2)
            .filter((arg) => arg !== "--apply")
            .join(" ");
          const result = improveSkill({ skillName, projectRoot, notes, apply });

          if (!result) return { text: `Skill not found: ${skillName}` };

          const lines = [
            `## Skill Improvement: ${result.skillName}`,
            "",
            `**Applied:** ${result.applied ? "yes" : "no"}`,
            `**Version:** ${result.previousVersion} -> ${result.newVersion}`,
            `**Source:** ${result.source}`,
            "",
            formatSkillEvaluation(result.evaluation),
          ];

          if (!result.applied) {
            lines.push("", "Run with `--apply` to write the improved skill and create a version snapshot.");
          } else if (result.version) {
            lines.push("", `Snapshot: ${result.version.snapshotPath}`);
          }

          return { text: lines.join("\n"), data: result };
        }

        case "versions": {
          const skillName = args[1];
          const versions = listSkillVersions(skillName);

          if (versions.length === 0) {
            return { text: skillName ? `No versions recorded for: ${skillName}` : "No skill versions recorded yet." };
          }

          const lines = [
            `## Skill Versions${skillName ? `: ${skillName}` : ""}`,
            "",
            ...versions.map((version) =>
              `- \`${version.skillName}\` ${version.previousVersion} -> ${version.newVersion} (${version.createdAt})\n  ${version.reason}\n  Snapshot: ${version.snapshotPath}`
            ),
          ];

          return { text: lines.join("\n"), data: versions };
        }

        default:
          return {
            text: `Usage: /skills <command>

Commands:
  list          - List all skills
  search <query> - Search skills
  show <name>    - Show skill details
  safety        - Show trust levels and permission summary
  categories    - List by category
  create <name> [desc] [triggers...] [--dry-run] - Create or preview a skill
  resolve <query> - Resolve query to skill
  review <name>   - Review skill quality
  evaluate <name> - Evaluate skill quality
  improve <name> [--apply] [notes...] - Propose or apply an improved skill version
  versions [name] - Show skill version history

Examples:
  /skills list
  /skills safety
  /skills search "git commit"
  /skills show git-commit
  /skills create my-skill "My custom skill" "custom" "help"
  /skills create my-skill "My custom skill" --dry-run
  /skills improve my-skill --apply "Added verification steps"`,
          };
      }
    },
  });

  // Skillify command
  commandRegistry.register({
    name: "skillify",
    description: "Capture current workflow as a reusable skill: /skillify <name>",
    execute: async (args, context): Promise<CommandResult> => {
      const name = args[0];
      if (!name) {
        return {
          text: `Usage: /skillify <name> [description] [--dry-run]

Captures the recent workflow as a skill for future reuse.
The skill will be saved to ~/.lulu/skills/learned/

Example:
  /skillify my-workflow "A useful workflow"
  /skillify my-workflow "A useful workflow" --dry-run`,
        };
      }

      const dryRun = args.includes("--dry-run");
      const description = args.slice(1).filter((arg) => arg !== "--dry-run").join(" ") || `Captured workflow: ${name}`;
      const capturedAt = `Captured at ${new Date().toISOString()}`;

      if (dryRun) {
        return {
          text: previewSkill({
            name,
            description,
            triggers: [name, ...name.split(/[-_]/)],
            category: "learned",
            qualityBar: "Successfully completed the workflow",
            steps: [capturedAt],
          }),
        };
      }

      const path = skillify({
        name,
        description,
        workflow: capturedAt,
        triggers: [name, ...name.split(/[-_]/)],
        category: "learned",
        auditContext: {
          projectName: context.config.projectName,
          channel: context.config.channel,
        },
      });

      return { text: `Skill captured: ${path}` };
    },
  });

  // Brain command
  commandRegistry.register({
    name: "brain",
    description: "Query the knowledge brain: /brain query, stats, ingest",
    execute: async (args, context): Promise<CommandResult> => {
      const sub = args[0]?.toLowerCase();
      const projectName = context.config.projectName || "default";
      const brain = getBrain(projectName);

      switch (sub) {
        case "query": {
          const query = args.slice(1).join(" ");
          if (!query) return { text: "Usage: /brain query <query>" };

          const results = await brain.hybridSearch(context.config, query, { limit: 5 });

          if (results.length === 0) {
            return { text: `No results for: "${query}"` };
          }

          const lines = [
            `## Brain Query: "${query}"`,
            "",
            ...results.map((r, i) => [
              `### ${i + 1}. ${r.page.title}`,
              `Source: ${r.source || "brain"}${r.sourcePath ? ` (${r.sourcePath})` : ""}`,
              r.page.content.slice(0, 200) + (r.page.content.length > 200 ? "..." : ""),
              `Score: ${r.score.toFixed(3)}`,
              r.highlights.length ? `Highlights:\n${r.highlights.map((h) => `- ${h}`).join("\n")}` : "",
              "",
            ].filter(Boolean).join("\n")),
          ];

          return { text: lines.join("\n"), data: results };
        }

        case "stats": {
          const stats = brain.getStats();
          return {
            text: `## Brain Stats

- **Pages:** ${stats.pages}
- **Entities:** ${stats.entities}
- **Relationships:** ${stats.relationships}`,
          };
        }

        case "ingest": {
          const title = args[1];
          const content = args.slice(2).join(" ");
          if (!title || !content) {
            return { text: "Usage: /brain ingest <title> <content>" };
          }

          const page = await brain.createPage({
            title,
            content,
            tags: ["manual-ingest"],
          });

          return { text: `Created page: ${page.slug}` };
        }

        default:
          return {
            text: `Usage: /brain <command>

Commands:
  query <query>  - Search the brain
  stats          - Show brain statistics
  ingest <title> <content> - Add a page

Examples:
  /brain query "previous work on auth"
  /brain stats
  /brain ingest "Auth Review" "Discussed OAuth implementation"`,
          };
      }
    },
  });

  // Resolver command
  commandRegistry.register({
    name: "resolver",
    description: "Manage skill resolver rules: /resolver list, add, remove",
    execute: async (args): Promise<CommandResult> => {
      const sub = args[0]?.toLowerCase();
      const resolver = getResolver();

      switch (sub) {
        case "list": {
          return { text: resolver.formatRules() };
        }

        case "add": {
          const when = args[1];
          const use = args[2];
          if (!when || !use) {
            return { text: "Usage: /resolver add <when> <skill-name>" };
          }

          resolver.addRule({ when, use });
          return { text: `Rule added: When ${when} → ${use}` };
        }

        case "remove": {
          const use = args[1];
          if (!use) {
            return { text: "Usage: /resolver remove <skill-name>" };
          }

          resolver.removeRule(use);
          return { text: `Rule removed: ${use}` };
        }

        default:
          return {
            text: `Usage: /resolver <command>

Commands:
  list              - Show all rules
  add <when> <skill> - Add a rule
  remove <skill>    - Remove a rule

Example:
  /resolver add "user asks about github" github-ops`,
          };
      }
    },
  });

  console.log("[Skills] Commands registered");
}

// Auto-register when imported
registerSkillCommands();
