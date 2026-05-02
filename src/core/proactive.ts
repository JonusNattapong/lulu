/**
 * Proactive Suggestion Engine
 * Background analyzer that watches session patterns and triggers proactive suggestions.
 * Suggests via notification (Telegram) or surfaces at session start.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { eventBus } from "./events.js";
import { notificationManager } from "./notifications.js";
import { userProfile } from "./user-profile.js";
import { skillProposalManager } from "./skill-proposal.js";

const SUGGESTIONS_PATH = path.join(homedir(), ".lulu", "proactive-suggestions.json");

export interface ProactiveSuggestion {
  id: string;
  type: "reminder" | "recommendation" | "pattern" | "warning" | "opportunity";
  title: string;
  body: string;
  context: string;
  priority: "low" | "medium" | "high";
  tags: string[];
  dismissed: boolean;
  createdAt: string;
  shownAt?: string;
}

interface SuggestionsStore {
  suggestions: ProactiveSuggestion[];
  patternHistory: string[];
  lastRun?: string;
}

const DEFAULT_STORE: SuggestionsStore = {
  suggestions: [],
  patternHistory: [],
};

class ProactiveEngine {
  private store: SuggestionsStore;

  constructor() {
    mkdirSync(path.dirname(SUGGESTIONS_PATH), { recursive: true });
    this.store = this.load();
  }

  private load(): SuggestionsStore {
    if (!existsSync(SUGGESTIONS_PATH)) {
      writeFileSync(SUGGESTIONS_PATH, JSON.stringify(DEFAULT_STORE, null, 2));
      return { ...DEFAULT_STORE };
    }
    try {
      return { ...DEFAULT_STORE, ...JSON.parse(readFileSync(SUGGESTIONS_PATH, "utf-8")) };
    } catch {
      return { ...DEFAULT_STORE };
    }
  }

  private save(): void {
    writeFileSync(SUGGESTIONS_PATH, JSON.stringify(this.store, null, 2));
  }

  /** Add a new suggestion */
  suggest(params: {
    type: ProactiveSuggestion["type"];
    title: string;
    body: string;
    context: string;
    priority?: "low" | "medium" | "high";
    tags?: string[];
  }): ProactiveSuggestion {
    // Avoid duplicates within 1 hour
    const recent = this.store.suggestions.find(s =>
      !s.dismissed &&
      s.title === params.title &&
      Date.now() - new Date(s.createdAt).getTime() < 3_600_000
    );
    if (recent) return recent;

    const suggestion: ProactiveSuggestion = {
      id: `sug-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: params.type,
      title: params.title,
      body: params.body,
      context: params.context,
      priority: params.priority || "medium",
      tags: params.tags || [],
      dismissed: false,
      createdAt: new Date().toISOString(),
    };

    this.store.suggestions.push(suggestion);
    if (this.store.suggestions.length > 50) {
      this.store.suggestions = this.store.suggestions.slice(-50);
    }
    this.save();

    eventBus.emit("proactive:suggestion:created", { id: suggestion.id, title: suggestion.title });

    return suggestion;
  }

  /** Notify user of a suggestion via Telegram */
  async notifyUser(suggestion: ProactiveSuggestion): Promise<void> {
    try {
      await notificationManager.send({
        title: `💡 ${suggestion.title}`,
        body: suggestion.body,
        source: "proactive",
        priority: suggestion.priority,
        timestamp: new Date().toISOString(),
      });
      suggestion.shownAt = new Date().toISOString();
      this.save();
    } catch (err) {
      console.error("[Proactive] Notification failed:", err);
    }
  }

  /** Run analysis and generate suggestions */
  async analyze(): Promise<ProactiveSuggestion[]> {
    const newSuggestions: ProactiveSuggestion[] = [];
    this.store.lastRun = new Date().toISOString();

    // Pattern-based suggestions
    const patterns = this.detectPatterns();
    for (const pattern of patterns) {
      const sug = this.suggest({
        type: "pattern",
        title: `Repeated pattern: ${pattern.label}`,
        body: pattern.description,
        context: pattern.context,
        priority: pattern.priority || "medium",
      });
      newSuggestions.push(sug);
    }

    // Skill proposal triggers
    const skillSug = this.analyzeSkillOpportunity();
    if (skillSug) newSuggestions.push(skillSug);

    // Project health checks
    const healthSug = await this.checkProjectHealth();
    if (healthSug) newSuggestions.push(healthSug);

    // High priority suggestions — notify immediately
    for (const sug of newSuggestions.filter(s => s.priority === "high")) {
      await this.notifyUser(sug);
    }

    this.save();
    return newSuggestions;
  }

  private detectPatterns(): Array<{
    label: string;
    description: string;
    context: string;
    priority?: "low" | "medium" | "high";
  }> {
    const patterns: Array<{
      label: string;
      description: string;
      context: string;
      priority?: "low" | "medium" | "high";
    }> = [];

    // Check recent pattern history
    if (this.store.patternHistory.length >= 3) {
      const counts = new Map<string, number>();
      for (const p of this.store.patternHistory) {
        counts.set(p, (counts.get(p) || 0) + 1);
      }

      for (const [pattern, count] of counts) {
        if (count >= 3) {
          patterns.push({
            label: pattern,
            description: `You've done "${pattern}" ${count} times recently. Consider creating a skill for this.`,
            context: `pattern:${pattern}:count:${count}`,
            priority: count >= 5 ? "high" : "low",
          });
        }
      }
    }

    // Morning routine detection
    const hour = new Date().getHours();
    if (hour >= 6 && hour <= 8) {
      patterns.push({
        label: "Morning routine",
        description: "Good morning! Ready for your daily workflow?",
        context: "time:morning",
        priority: "low",
      });
    }

    return patterns;
  }

  private analyzeSkillOpportunity(): ProactiveSuggestion | null {
    const profile = userProfile.getProfile();
    const recentLearnings = profile.learnings.filter(l =>
      l.type === "pattern" &&
      Date.now() - new Date(l.createdAt).getTime() < 7 * 24 * 60 * 60 * 1000
    );

    if (recentLearnings.length >= 3) {
      return this.suggest({
        type: "recommendation",
        title: "Skill opportunity detected",
        body: `I noticed ${recentLearnings.length} patterns this week that could become useful skills. Run /proposals to review.`,
        context: "skill:opportunity",
        priority: "medium",
      });
    }

    return null;
  }

  private async checkProjectHealth(): Promise<ProactiveSuggestion | null> {
    // Check for common issues — placeholder, real implementation would check git, tests, etc.
    return null;
  }

  /** Record a pattern for analysis */
  recordPattern(pattern: string): void {
    this.store.patternHistory.push(pattern);
    if (this.store.patternHistory.length > 200) {
      this.store.patternHistory = this.store.patternHistory.slice(-200);
    }
    this.save();
  }

  /** Dismiss a suggestion */
  dismiss(id: string): void {
    const sug = this.store.suggestions.find(s => s.id === id);
    if (sug) {
      sug.dismissed = true;
      this.save();
    }
  }

  /** Get active (non-dismissed) suggestions */
  getActive(): ProactiveSuggestion[] {
    return this.store.suggestions.filter(s => !s.dismissed).slice(-10);
  }

  /** Get suggestions for session start */
  getSessionStartSuggestions(): ProactiveSuggestion[] {
    return this.store.suggestions
      .filter(s => !s.dismissed && !s.shownAt)
      .slice(-3)
      .map(s => {
        s.shownAt = new Date().toISOString();
        return s;
      });
  }

  /** Build suggestions text for session start */
  buildSessionStartText(): string {
    const suggestions = this.getSessionStartSuggestions();
    if (suggestions.length === 0) return "";
    this.save();

    const lines = ["\n--- 💡 Proactive Suggestions ---"];
    for (const sug of suggestions) {
      lines.push(`• **${sug.title}**: ${sug.body}`);
    }
    return lines.join("\n");
  }

  /** Get all suggestions */
  list(): ProactiveSuggestion[] {
    return this.store.suggestions.filter(s => !s.dismissed).slice(-20);
  }
}

export const proactiveEngine = new ProactiveEngine();