import type { CommandContext, CommandResult } from "./commands.js";
import { loadAllSkills, searchSkills, listCategories, getSkillStats, formatSkill, createSkill, skillify } from "./skills.js";
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
          const triggers = args.slice(3);

          if (!name) {
            return {
              text: `Usage: /skills create <name> [description] [triggers...]

Example:
  /skills create my-skill "Does something useful" "useful" "help"`,
            };
          }

          const path = createSkill({
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
          });

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

        default:
          return {
            text: `Usage: /skills <command>

Commands:
  list          - List all skills
  search <query> - Search skills
  show <name>    - Show skill details
  categories    - List by category
  create <name> [desc] [triggers...] - Create new skill
  resolve <query> - Resolve query to skill

Examples:
  /skills list
  /skills search "git commit"
  /skills show git-commit
  /skills create my-skill "My custom skill" "custom" "help"`,
          };
      }
    },
  });

  // Skillify command
  commandRegistry.register({
    name: "skillify",
    description: "Capture current workflow as a reusable skill: /skillify <name>",
    execute: async (args): Promise<CommandResult> => {
      const name = args[0];
      if (!name) {
        return {
          text: `Usage: /skillify <name> [description]

Captures the recent workflow as a skill for future reuse.
The skill will be saved to ~/.lulu/skills/learned/

Example:
  /skillify my-workflow "A useful workflow"`,
        };
      }

      const description = args.slice(1).join(" ") || `Captured workflow: ${name}`;

      const path = skillify({
        name,
        description,
        workflow: `Captured at ${new Date().toISOString()}`,
        triggers: [name, ...name.split(/[-_]/)],
        category: "learned",
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
              r.page.content.slice(0, 200) + (r.page.content.length > 200 ? "..." : ""),
              `Score: ${r.score.toFixed(3)}`,
              "",
            ].join("\n")),
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