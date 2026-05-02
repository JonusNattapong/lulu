/**
 * User Profile System
 * Stores long-term user preferences, learning history, skill proposals, and personality.
 * Loaded into every agent prompt as user context layer.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const PROFILE_PATH = path.join(homedir(), ".lulu", "user-profile.json");

export interface UserPreference {
  key: string;
  value: string;
  context: string;
  confidence: number;
  firstSeen: string;
  lastUpdated: string;
  source: "correction" | "suggestion_accepted" | "suggestion_rejected" | "explicit" | "pattern";
}

export interface SkillProposal {
  id: string;
  name: string;
  description: string;
  workflow: string;
  triggers: string[];
  frequency: number;
  acceptanceRate: number;
  status: "proposed" | "approved" | "rejected" | "merged";
  createdAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
}

export interface LearningEntry {
  id: string;
  type: "preference" | "skill_proposal" | "insight" | "pattern";
  content: string;
  context: string;
  confidence: number;
  createdAt: string;
  appliedAt?: string;
}

export interface AgentPersonality {
  tone: "formal" | "casual" | "friendly" | "terse";
  verbosity: "minimal" | "moderate" | "verbose";
  explanations: "brief" | "medium" | "detailed";
  initiative: "passive" | "mild" | "proactive";
}

export interface UserProfile {
  name?: string;
  personality: AgentPersonality;
  preferences: UserPreference[];
  skillProposals: SkillProposal[];
  learnings: LearningEntry[];
  sessionCount: number;
  totalTurns: number;
  createdAt: string;
  lastActive: string;
  activeProjects: string[];
  recentPatterns: string[];
}

const DEFAULT_PROFILE: UserProfile = {
  personality: {
    tone: "casual",
    verbosity: "moderate",
    explanations: "medium",
    initiative: "mild",
  },
  preferences: [],
  skillProposals: [],
  learnings: [],
  sessionCount: 0,
  totalTurns: 0,
  createdAt: new Date().toISOString(),
  lastActive: new Date().toISOString(),
  activeProjects: [],
  recentPatterns: [],
};

class UserProfileManager {
  private profile: UserProfile;

  constructor() {
    this.profile = this.load();
  }

  private load(): UserProfile {
    if (!existsSync(PROFILE_PATH)) {
      mkdirSync(path.dirname(PROFILE_PATH), { recursive: true });
      writeFileSync(PROFILE_PATH, JSON.stringify(DEFAULT_PROFILE, null, 2));
      return { ...DEFAULT_PROFILE };
    }
    try {
      return { ...DEFAULT_PROFILE, ...JSON.parse(readFileSync(PROFILE_PATH, "utf-8")) };
    } catch {
      return { ...DEFAULT_PROFILE };
    }
  }

  private save(): void {
    writeFileSync(PROFILE_PATH, JSON.stringify(this.profile, null, 2));
  }

  /** Increment session count and update last active */
  touch(): void {
    this.profile.sessionCount++;
    this.profile.lastActive = new Date().toISOString();
    this.save();
  }

  /** Increment turn count (called per agent turn) */
  addTurn(projectName?: string): void {
    this.profile.totalTurns++;
    if (projectName && !this.profile.activeProjects.includes(projectName)) {
      this.profile.activeProjects.push(projectName);
    }
    this.save();
  }

  /** Set user name */
  setName(name: string): void {
    this.profile.name = name;
    this.save();
  }

  /** Update personality settings */
  updatePersonality(patch: Partial<AgentPersonality>): void {
    this.profile.personality = { ...this.profile.personality, ...patch };
    this.save();
  }

  /** Add or update a preference from feedback */
  recordPreference(
    key: string,
    value: string,
    context: string,
    source: UserPreference["source"],
    confidence = 0.8
  ): void {
    const existing = this.profile.preferences.find(p => p.key === key);
    if (existing) {
      existing.value = value;
      existing.context = context;
      existing.confidence = Math.min(1, (existing.confidence * existing.confidence + confidence) / 2);
      existing.lastUpdated = new Date().toISOString();
    } else {
      this.profile.preferences.push({
        key,
        value,
        context,
        confidence,
        firstSeen: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        source,
      });
    }
    this.save();
  }

  /** Learn from pattern (repetitive behavior) */
  recordPattern(pattern: string): void {
    if (!this.profile.recentPatterns.includes(pattern)) {
      this.profile.recentPatterns.unshift(pattern);
      if (this.profile.recentPatterns.length > 20) {
        this.profile.recentPatterns = this.profile.recentPatterns.slice(0, 20);
      }
      this.addLearning("pattern", pattern, pattern, 0.7);
    }
    this.save();
  }

  /** Add a skill proposal */
  addSkillProposal(name: string, description: string, workflow: string, triggers: string[]): string {
    const id = `proposal-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    this.profile.skillProposals.push({
      id,
      name,
      description,
      workflow,
      triggers,
      frequency: 1,
      acceptanceRate: 0,
      status: "proposed",
      createdAt: new Date().toISOString(),
    });
    this.save();
    return id;
  }

  /** Update skill proposal status */
  reviewSkillProposal(id: string, status: "approved" | "rejected" | "merged"): void {
    const proposal = this.profile.skillProposals.find(p => p.id === id);
    if (!proposal) return;
    proposal.status = status;
    proposal.reviewedAt = new Date().toISOString();
    if (status === "approved" || status === "merged") {
      proposal.acceptanceRate = 1;
    }
    this.save();
  }

  /** Increment proposal frequency */
  incrementProposalFrequency(id: string): void {
    const proposal = this.profile.skillProposals.find(p => p.id === id);
    if (proposal) {
      proposal.frequency++;
      this.save();
    }
  }

  /** Add a learning entry */
  addLearning(type: LearningEntry["type"], content: string, context: string, confidence = 0.6): void {
    const id = `learn-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    this.profile.learnings.push({
      id,
      type,
      content,
      context,
      confidence,
      createdAt: new Date().toISOString(),
    });
    if (this.profile.learnings.length > 500) {
      this.profile.learnings = this.profile.learnings.slice(-500);
    }
    this.save();
  }

  /** Get all active (non-rejected) proposals */
  getActiveProposals(): SkillProposal[] {
    return this.profile.skillProposals.filter(p => p.status === "proposed");
  }

  /** Get proposal by id */
  getProposal(id: string): SkillProposal | null {
    return this.profile.skillProposals.find(p => p.id === id) ?? null;
  }

  /** Build user context string for system prompt */
  buildUserContext(): string {
    const parts: string[] = [];

    if (this.profile.name) {
      parts.push(`User name: ${this.profile.name}`);
    }

    parts.push(`Sessions: ${this.profile.sessionCount}, Turns: ${this.profile.totalTurns}`);

    if (this.profile.preferences.length > 0) {
      const prefs = this.profile.preferences
        .filter(p => p.confidence > 0.6)
        .map(p => `- ${p.key}: ${p.value}`)
        .join("\n");
      parts.push(`Known preferences:\n${prefs}`);
    }

    if (this.profile.activeProjects.length > 0) {
      parts.push(`Active projects: ${this.profile.activeProjects.join(", ")}`);
    }

    if (this.profile.learnings.length > 0) {
      const recentInsights = this.profile.learnings
        .slice(-10)
        .map(l => `- [${l.type}] ${l.content}`)
        .join("\n");
      parts.push(`Recent learnings:\n${recentInsights}`);
    }

    return parts.join("\n");
  }

  /** Build agent personality directive */
  buildPersonalityDirective(): string {
    const p = this.profile.personality;
    const directives: string[] = [];

    if (p.tone === "formal") directives.push("Use formal language and professional tone.");
    else if (p.tone === "casual") directives.push("Use casual, friendly tone.");
    else if (p.tone === "terse") directives.push("Be concise and to the point. Avoid unnecessary words.");

    if (p.verbosity === "minimal") directives.push("Keep responses brief and minimal.");
    else if (p.verbosity === "verbose") directives.push("Provide thorough, detailed responses.");

    if (p.explanations === "brief") directives.push("Explain only when asked.");
    else if (p.explanations === "detailed") directives.push("Always explain your reasoning and steps.");

    if (p.initiative === "proactive") directives.push("Proactively suggest improvements and next steps.");
    else if (p.initiative === "passive") directives.push("Only respond to explicit requests.");

    return directives.join("\n");
  }

  /** Get full profile */
  getProfile(): UserProfile {
    return { ...this.profile };
  }

  /** Get statistics */
  getStats(): {
    sessions: number;
    turns: number;
    preferences: number;
    proposals: number;
    learnings: number;
    activeProjects: number;
  } {
    return {
      sessions: this.profile.sessionCount,
      turns: this.profile.totalTurns,
      preferences: this.profile.preferences.length,
      proposals: this.profile.skillProposals.filter(p => p.status === "proposed").length,
      learnings: this.profile.learnings.length,
      activeProjects: this.profile.activeProjects.length,
    };
  }
}

export const userProfile = new UserProfileManager();