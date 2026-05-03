/**
 * Skill Proposal System
 * After successful complex workflows, agent proposes a skill.
 * User reviews via /proposals command, then approves/rejects.
 * Approved proposals auto-create skill files.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { eventBus } from "./events.js";
import { createSkill, loadSkillFile } from "./skills.js";
import { evaluateSkill, improveSkill } from "./skill-improvement.js";

const PROPOSALS_PATH = path.join(homedir(), ".lulu", "skill-proposals.json");
const SKILLS_DIR = path.join(homedir(), ".lulu", "skills", "auto-generated");

export interface SkillProposalRecord {
  id: string;
  name: string;
  description: string;
  category: string;
  triggers: string[];
  steps: string;
  examples: string[];
  frequency: number;
  acceptanceRate: number;
  status: "proposed" | "approved" | "rejected" | "merged";
  createdAt: string;
  reviewedAt?: string;
  createdSkillPath?: string;
  evaluationScore?: number;
  improvedVersion?: string;
}

interface ProposalsStore {
  proposals: SkillProposalRecord[];
  totalProposed: number;
  totalApproved: number;
  totalRejected: number;
}

const DEFAULT_STORE: ProposalsStore = {
  proposals: [],
  totalProposed: 0,
  totalApproved: 0,
  totalRejected: 0,
};

class SkillProposalManager {
  private store: ProposalsStore;

  constructor() {
    mkdirSync(path.dirname(PROPOSALS_PATH), { recursive: true });
    mkdirSync(SKILLS_DIR, { recursive: true });
    this.store = this.load();
  }

  private load(): ProposalsStore {
    if (!existsSync(PROPOSALS_PATH)) {
      writeFileSync(PROPOSALS_PATH, JSON.stringify(DEFAULT_STORE, null, 2));
      return { ...DEFAULT_STORE };
    }
    try {
      return { ...DEFAULT_STORE, ...JSON.parse(readFileSync(PROPOSALS_PATH, "utf-8")) };
    } catch {
      return { ...DEFAULT_STORE };
    }
  }

  private save(): void {
    writeFileSync(PROPOSALS_PATH, JSON.stringify(this.store, null, 2));
  }

  /** Propose a new skill from workflow analysis */
  propose(params: {
    name: string;
    description: string;
    category?: string;
    triggers: string[];
    steps: string;
    examples?: string[];
  }): SkillProposalRecord {
    // Check for duplicate (same name or very similar workflow)
    const existing = this.store.proposals.find(p =>
      p.name.toLowerCase() === params.name.toLowerCase() ||
      (p.status === "proposed" && p.description === params.description)
    );
    if (existing) {
      existing.frequency++;
      this.save();
      return existing;
    }

    const proposal: SkillProposalRecord = {
      id: `proposal-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: params.name,
      description: params.description,
      category: params.category || "auto-generated",
      triggers: params.triggers,
      steps: params.steps,
      examples: params.examples || [],
      frequency: 1,
      acceptanceRate: 0,
      status: "proposed",
      createdAt: new Date().toISOString(),
    };

    this.store.proposals.push(proposal);
    this.store.totalProposed++;
    this.save();

    eventBus.emit("skill:proposal:created", {
      id: proposal.id,
      name: proposal.name,
      description: proposal.description,
    });

    return proposal;
  }

  /** Review and approve a proposal — creates the skill file */
  approve(id: string): SkillProposalRecord | null {
    const proposal = this.store.proposals.find(p => p.id === id);
    if (!proposal || proposal.status !== "proposed") return null;

    proposal.status = "approved";
    proposal.reviewedAt = new Date().toISOString();
    proposal.acceptanceRate = 1;
    this.store.totalApproved++;

    // Create the skill file, then immediately run the self-improvement pass.
    const skillPath = this.createSkillFile(proposal);
    proposal.createdSkillPath = skillPath;
    const createdSkill = loadSkillFile(skillPath);
    if (createdSkill) {
      const evaluation = evaluateSkill(createdSkill);
      proposal.evaluationScore = evaluation.score;
      if (evaluation.score < 90) {
        const improvement = improveSkill({
          skillName: createdSkill.name,
          notes: `Auto-normalized after approving proposal ${proposal.id}.`,
          apply: true,
        });
        if (improvement?.applied) {
          proposal.improvedVersion = improvement.newVersion;
          proposal.evaluationScore = improvement.evaluation.score;
        }
      }
    }
    this.save();

    eventBus.emit("skill:proposal:approved", { id, name: proposal.name });
    return proposal;
  }

  /** Reject a proposal */
  reject(id: string): void {
    const proposal = this.store.proposals.find(p => p.id === id);
    if (!proposal || proposal.status !== "proposed") return;
    proposal.status = "rejected";
    proposal.reviewedAt = new Date().toISOString();
    this.store.totalRejected++;
    this.save();
    eventBus.emit("skill:proposal:rejected", { id, name: proposal.name });
  }

  /** Merge a proposal into an existing skill */
  merge(id: string, targetSkillName: string): void {
    const proposal = this.store.proposals.find(p => p.id === id);
    if (!proposal) return;
    proposal.status = "merged";
    proposal.reviewedAt = new Date().toISOString();
    this.store.totalApproved++;
    this.save();
    eventBus.emit("skill:proposal:merged", { id, name: proposal.name, target: targetSkillName });
  }

  private createSkillFile(proposal: SkillProposalRecord): string {
    const steps = proposal.steps
      .split("\n")
      .map((step) => step.replace(/^\d+[\.\)]\s*/, "").trim())
      .filter(Boolean);

    return createSkill({
      name: proposal.name.replace(/\s+/g, "-").toLowerCase(),
      description: proposal.description,
      triggers: proposal.triggers.length ? proposal.triggers : [proposal.name],
      category: proposal.category || "auto-generated",
      qualityBar: "The workflow is completed, verified, and any reusable lesson is captured for the next run.",
      steps: steps.length ? steps : ["Clarify the workflow.", "Execute the repeated steps.", "Verify the result."],
      trustLevel: "community",
    });
  }

  /** List all proposals */
  list(): SkillProposalRecord[] {
    return this.store.proposals
      .filter(p => p.status === "proposed")
      .sort((a, b) => b.frequency - a.frequency);
  }

  /** List all (including reviewed) */
  listAll(): SkillProposalRecord[] {
    return [...this.store.proposals].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /** Get proposal by id */
  get(id: string): SkillProposalRecord | null {
    return this.store.proposals.find(p => p.id === id) ?? null;
  }

  /** Get statistics */
  getStats(): { total: number; proposed: number; approved: number; rejected: number; merged: number } {
    return {
      total: this.store.proposals.length,
      proposed: this.store.proposals.filter(p => p.status === "proposed").length,
      approved: this.store.proposals.filter(p => p.status === "approved").length,
      rejected: this.store.proposals.filter(p => p.status === "rejected").length,
      merged: this.store.proposals.filter(p => p.status === "merged").length,
    };
  }

  /** Generate a skill name from workflow context */
  generateSkillName(workflow: string, trigger: string): string {
    // Extract meaningful name from workflow
    const words = workflow.split(/\s+/).filter(w => w.length > 3).slice(0, 4);
    const base = words.join("-").replace(/[^a-zA-Z0-9-]/g, "") || trigger.replace(/[^a-zA-Z]/g, "");
    return base.charAt(0).toUpperCase() + base.slice(1);
  }

  /** Clean old proposals (keep last 100) */
  prune(): void {
    if (this.store.proposals.length > 100) {
      this.store.proposals = this.store.proposals
        .filter(p => p.status === "proposed")
        .concat(this.store.proposals.filter(p => p.status !== "proposed").slice(-50));
      this.save();
    }
  }
}

export const skillProposalManager = new SkillProposalManager();
