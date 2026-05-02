import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { type Skill, loadSkillsFromDir, getGlobalSkillDir } from "./skills.js";

export interface ResolverRule {
  when: string; // e.g., "user asks about X"
  use: string; // e.g., "skill-name"
  category?: string;
}

export interface ResolverResult {
  skill: Skill;
  rule: ResolverRule;
  confidence: number;
}

export class SkillResolver {
  private rules: ResolverRule[] = [];
  private rulesFile: string;

  constructor() {
    this.rulesFile = path.join(getGlobalSkillDir(), "resolver.md");
    this.loadRules();
  }

  private loadRules(): void {
    if (!existsSync(this.rulesFile)) {
      // Use default rules
      this.rules = this.getDefaultRules();
      return;
    }

    try {
      const content = readFileSync(this.rulesFile, "utf-8");
      this.rules = this.parseResolver(content);
    } catch {
      this.rules = this.getDefaultRules();
    }
  }

  private parseResolver(content: string): ResolverRule[] {
    const rules: ResolverRule[] = [];
    const lines = content.split("\n");

    for (const line of lines) {
      // Match patterns like:
      // - When user asks about X → use skill-name
      // - When X → use skill-name
      // - X → skill-name

      const arrowMatch = line.match(/^(.+?)\s*[→→\-]\s*(.+)$/);
      if (arrowMatch) {
        const when = arrowMatch[1].trim();
        const use = arrowMatch[2].trim();

        // Detect category from common patterns
        let category: string | undefined;
        if (when.includes("[git]") || use.startsWith("git/")) category = "git";
        if (when.includes("[web]") || use.startsWith("web/")) category = "web";
        if (when.includes("[code]") || use.startsWith("code/")) category = "code";
        if (when.includes("[research]") || use.startsWith("research/")) category = "research";

        rules.push({ when, use, category });
      }
    }

    return rules;
  }

  private getDefaultRules(): ResolverRule[] {
    return [
      // Git operations
      { when: "user asks to commit changes", use: "git-commit", category: "git" },
      { when: "user asks about git status", use: "git-status", category: "git" },
      { when: "user asks to create branch", use: "git-branch", category: "git" },
      { when: "user asks to merge branches", use: "git-merge", category: "git" },
      { when: "user asks to push to remote", use: "git-push", category: "git" },
      { when: "user asks to pull from remote", use: "git-pull", category: "git" },
      { when: "user asks about git history", use: "git-history", category: "git" },

      // Code operations
      { when: "user asks to refactor code", use: "code-refactor", category: "code" },
      { when: "user asks to debug issue", use: "code-debug", category: "code" },
      { when: "user asks to write tests", use: "code-test", category: "code" },
      { when: "user asks to review code", use: "code-review", category: "code" },
      { when: "user asks to explain code", use: "code-explain", category: "code" },

      // Web operations
      { when: "user asks to search the web", use: "web-search", category: "web" },
      { when: "user asks to scrape website", use: "web-scrape", category: "web" },
      { when: "user asks to browse website", use: "web-browse", category: "web" },
      { when: "user asks to check API", use: "web-api", category: "web" },

      // Research operations
      { when: "user asks to research topic", use: "research", category: "research" },
      { when: "user asks to summarize", use: "research-summarize", category: "research" },
      { when: "user asks to analyze", use: "research-analyze", category: "research" },
      { when: "user asks about documentation", use: "research-docs", category: "research" },

      // Brain operations
      { when: "user asks about previous conversations", use: "brain-query", category: "brain" },
      { when: "user asks to remember something", use: "brain-ingest", category: "brain" },
      { when: "user asks about people or companies", use: "brain-enrich", category: "brain" },

      // Task operations
      { when: "user asks to manage tasks", use: "task-manager", category: "tasks" },
      { when: "user asks to plan day", use: "daily-task-prep", category: "tasks" },
      { when: "user asks to create schedule", use: "cron-scheduler", category: "tasks" },

      // Setup operations
      { when: "user asks to set up project", use: "setup", category: "setup" },
      { when: "user asks about configuration", use: "setup-config", category: "setup" },
      { when: "first interaction", use: "soul-audit", category: "setup" },
    ];
  }

  resolve(query: string, skills: Skill[]): ResolverResult | null {
    const queryLower = query.toLowerCase();

    // Score each rule against the query
    const scoredRules = this.rules
      .map((rule) => {
        const whenLower = rule.when.toLowerCase();
        let confidence = 0;

        // Exact match
        if (queryLower.includes(whenLower)) {
          confidence = 1.0;
        } else {
          // Partial match
          const ruleWords = whenLower.split(/\s+/).filter((w) => w.length > 2);
          const matchedWords = ruleWords.filter((w) => queryLower.includes(w));
          confidence = ruleWords.length > 0 ? matchedWords.length / ruleWords.length : 0;
        }

        return { rule, confidence };
      })
      .filter((r) => r.confidence > 0)
      .sort((a, b) => b.confidence - a.confidence);

    if (scoredRules.length === 0) return null;

    const best = scoredRules[0];
    const skill = skills.find(
      (s) =>
        s.name.toLowerCase() === best.rule.use.toLowerCase() ||
        s.name.toLowerCase().includes(best.rule.use.toLowerCase())
    );

    if (!skill) return null;

    return { skill, rule: best.rule, confidence: best.confidence };
  }

  getRulesByCategory(category: string): ResolverRule[] {
    return this.rules.filter((r) => r.category === category);
  }

  addRule(rule: ResolverRule): void {
    // Remove existing rule with same 'use'
    this.rules = this.rules.filter((r) => r.use !== rule.use);
    this.rules.push(rule);
    this.saveRules();
  }

  removeRule(use: string): void {
    this.rules = this.rules.filter((r) => r.use !== use);
    this.saveRules();
  }

  private saveRules(): void {
    const lines = [
      "# Skill Resolver",
      "",
      "Routes requests to appropriate skills based on triggers.",
      "",
      "## Rules",
      "",
      ...this.rules.map((r) => `- When ${r.when} → ${r.use}`),
    ];

    // Ensure directory exists
    const dir = path.dirname(this.rulesFile);
    if (!existsSync(dir)) {
      const { mkdirSync } = require("node:fs");
      mkdirSync(dir, { recursive: true });
    }

    require("node:fs").writeFileSync(this.rulesFile, lines.join("\n"), "utf-8");
  }

  formatRules(): string {
    const byCategory: Record<string, ResolverRule[]> = {};
    for (const rule of this.rules) {
      const cat = rule.category || "general";
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push(rule);
    }

    const lines = ["## Skill Resolver Rules", ""];
    for (const [category, rules] of Object.entries(byCategory).sort()) {
      lines.push(`### ${category}`);
      for (const rule of rules) {
        lines.push(`- When ${rule.when} → ${rule.use}`);
      }
      lines.push("");
    }

    return lines.join("\n");
  }
}

// Singleton instance
let resolverInstance: SkillResolver | null = null;

export function getResolver(): SkillResolver {
  if (!resolverInstance) {
    resolverInstance = new SkillResolver();
  }
  return resolverInstance;
}