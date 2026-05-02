/**
 * Persistent Agent Daemon
 * Background process that maintains persistent context across sessions.
 * Does NOT reset after each session — retains conversation history, context, preferences.
 * Listens to eventBus for session events, scheduled ticks, and tool calls.
 */
import { eventBus } from "./events.js";
import { userProfile } from "./user-profile.js";
import { skillProposalManager } from "./skill-proposal.js";
import { proactiveEngine } from "./proactive.js";
import { notificationManager } from "./notifications.js";
import { alwaysOnService } from "./alwayson.js";
import { SchedulerManager } from "./scheduler.js";
import { subAgentManager } from "./subagent.js";
import { globalMemory } from "./global-memory.js";
import { taskQueue } from "./task-queue.js";
import { autonomousResearcher } from "./autonomous-research.js";
import { selfReflection } from "./self-reflection.js";
import { preferenceLearner } from "./preferences.js";
import { syncPreferencesToGlobalSoul } from "./soul.js";
import { loadAllSkills, searchSkills, validateSkill } from "./skills.js";
import type { MessageParam } from "@anthropic-ai/sdk/resources/index.js";

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

export interface DaemonStatus {
  pid: number;
  startedAt: string;
  uptime: number;
  sessions: number;
  turns: number;
  memoryUsage: number;
  activeAgents: number;
  pendingProposals: number;
  activeSuggestions: number;
  globalMemory: { facts: number; todos: number; pendingResearch: number };
  taskQueue: { pending: number; scheduled: number; total: number };
  autoResearch: boolean;
}

interface PersistentContext {
  conversationHistory: MessageParam[];
  pendingTasks: string[];
  activeProjects: string[];
  learnedFacts: Map<string, string>;
  lastSuggestionCheck: string;
  lastReflection: string;
}

const MAX_HISTORY = 50;
const REFLECTION_INTERVAL_MS = 30 * 60 * 1000; // 30 min

class PersonalAgentDaemon {
  private running = false;
  private context: PersistentContext = {
    conversationHistory: [],
    pendingTasks: [],
    activeProjects: [],
    learnedFacts: new Map(),
    lastSuggestionCheck: "",
    lastReflection: "",
  };
  private pid: number;
  private startedAt: string;

  constructor() {
    this.pid = process.pid;
    this.startedAt = new Date().toISOString();
  }

  /** Start the daemon */
  start(): void {
    if (this.running) {
      console.log("[Daemon] Already running");
      return;
    }

    this.running = true;
    this.writePid();

    // Subscribe to events
    this.setupEventHandlers();

    // Start always-on service
    alwaysOnService.start();

    // Enable auto research if configured
    if (process.env.LULU_AUTO_RESEARCH === "true") {
      autonomousResearcher.enableAutoResearch(true);
    }

    // Run proactive analysis on start
    this.runStartupAnalysis();

    console.log(`[Daemon] Personal agent daemon started (PID: ${this.pid})`);

    eventBus.emit("daemon:start", {
      pid: this.pid,
      startedAt: this.startedAt,
      contextSize: this.context.conversationHistory.length,
    });
  }

  /** Stop the daemon */
  stop(): void {
    if (!this.running) return;
    this.running = false;

    alwaysOnService.stop();
    this.removePid();

    console.log("[Daemon] Stopped");

    eventBus.emit("daemon:stop", { uptime: this.getUptime() });
  }

  private writePid(): void {
    const { existsSync, writeFileSync, mkdirSync } = require("node:fs");
    const { homedir } = require("node:os");
    const path = require("node:path");
    const dir = path.join(homedir(), ".lulu");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "daemon.pid"), String(this.pid));
  }

  private removePid(): void {
    const { existsSync, unlinkSync } = require("node:fs");
    const { homedir } = require("node:os");
    const path = require("node:path");
    const pidPath = path.join(homedir(), ".lulu", "daemon.pid");
    if (existsSync(pidPath)) {
      try { unlinkSync(pidPath); } catch {}
    }
  }

  private setupEventHandlers(): void {
    // Session start — load context and surface suggestions
    eventBus.on("session:start", (data, sessionId) => {
      this.onSessionStart(data, sessionId);
    });

    // Session end — store context, run reflection
    eventBus.on("session:end", (data, sessionId) => {
      this.onSessionEnd(data, sessionId);
    });

    // Tool calls — track patterns
    eventBus.on("tool:start", (data) => {
      this.recordToolPattern(data);
    });

    // Tool end — learn from tool results
    eventBus.on("tool:end", (data) => {
      this.recordToolResult(data);
    });

    // Sub-agent events
    eventBus.on("subagent:end", (data) => {
      this.onSubAgentDone(data);
    });

    // Always-on tick
    eventBus.on("alwayson:tick", () => {
      this.runPeriodicAnalysis();
    });

    // Proactive suggestion triggers
    eventBus.on("proactive:suggestion:created", (data) => {
      const sug = proactiveEngine.getActive().find(s => s.id === data.id);
      if (sug && sug.priority === "high") {
        notificationManager.send({
          title: `💡 ${sug.title}`,
          body: sug.body,
          source: "daemon",
          priority: "medium",
          timestamp: new Date().toISOString(),
        }).catch(() => {});
      }
    });
  }

  private onSessionStart(data: any, sessionId: string): void {
    userProfile.touch();
    userProfile.addTurn(data.projectName);
    proactiveEngine.recordPattern(`session:${data.projectName || "default"}`);
  }

  private onSessionEnd(data: any, sessionId: string): void {
    // Store conversation context
    if (data.messages && data.messages.length > 0) {
      this.context.conversationHistory.push(...data.messages.slice(-5));
      if (this.context.conversationHistory.length > MAX_HISTORY) {
        this.context.conversationHistory = this.context.conversationHistory.slice(-MAX_HISTORY);
      }
    }

    // Record session metrics for self-reflection
    const turns = data.messages?.length || 0;
    const toolCalls = this.countToolCalls(data.messages);
    const errors = this.countErrors(data.messages);
    selfReflection.recordSession({
      turns,
      toolCalls,
      errors,
      timeMs: Date.now() - new Date(data.messages?.[0]?.timestamp || Date.now()).getTime(),
      completed: true,
    });

    // Run skill proposal detection
    this.detectSkillOpportunity(data);

    // Sync preferences to global soul
    syncPreferencesToGlobalSoul(userProfile.getProfile());

    // Check if reflection is due
    const lastRef = new Date(this.context.lastReflection).getTime();
    if (Date.now() - lastRef > REFLECTION_INTERVAL_MS) {
      this.runSelfReflection();
    }
  }

  private recordToolPattern(data: any): void {
    proactiveEngine.recordPattern(`tool:${data.name}`);
    userProfile.addTurn();
  }

  private recordToolResult(data: any): void {
    if (data.result?.is_error) {
      proactiveEngine.recordPattern(`error:${data.name}`);
      userProfile.addLearning("insight", `Tool ${data.name} failed: ${data.result.content?.slice(0, 100)}`, `tool:${data.name}`, 0.8);
    }
    // Learn from repeated tool usage
    preferenceLearner.learnFromToolUsage(data.name, 1);
  }

  private countToolCalls(messages: any[]): number {
    if (!messages) return 0;
    let count = 0;
    for (const msg of messages) {
      if (typeof msg.content === "string" && msg.content.includes("tool_use")) {
        count += (msg.content.match(/tool_use/g) || []).length;
      }
    }
    return count;
  }

  private countErrors(messages: any[]): number {
    if (!messages) return 0;
    let count = 0;
    for (const msg of messages) {
      if (typeof msg.content === "string") {
        if (msg.content.includes("is_error") || msg.content.toLowerCase().includes("error")) count++;
      }
    }
    return count;
  }

  private onSubAgentDone(data: any): void {
    if (data.result?.text) {
      proactiveEngine.recordPattern(`subagent:${data.id}`);
    }
  }

  private async runStartupAnalysis(): Promise<void> {
    // Check for pending proposals
    const proposals = skillProposalManager.list();
    if (proposals.length > 0) {
      await notificationManager.send({
        title: `🎯 ${proposals.length} skill proposal(s) pending review`,
        body: "Run /proposals to review and approve.",
        source: "daemon",
        priority: "low",
        timestamp: new Date().toISOString(),
      });
    }

    // Run proactive analysis
    if (process.env.LULU_PROACTIVE_SUGGESTIONS === "true") {
      await proactiveEngine.analyze();
    }
  }

  private async runPeriodicAnalysis(): Promise<void> {
    this.context.lastSuggestionCheck = new Date().toISOString();

    if (process.env.LULU_PROACTIVE_SUGGESTIONS === "true") {
      await proactiveEngine.analyze();
    }

    // Auto-curation: analyze skills every 4 hours
    if (process.env.LULU_AUTO_CURATION === "true") {
      await this.runCurationCheck();
    }
  }

  private async runCurationCheck(): Promise<void> {
    try {
      const projectRoots = this.context.activeProjects;
      if (projectRoots.length === 0) {
        projectRoots.push(process.cwd());
      }

      for (const projectRoot of projectRoots) {
        const skills = loadAllSkills(projectRoot);
        const suggestions: string[] = [];

        // Check for orphaned skills (no triggers)
        for (const skill of skills) {
          if (!skill.triggers || skill.triggers.length === 0) {
            suggestions.push(`Skill "${skill.name}" has no triggers and may never be retrieved`);
          }
        }

        // Check for very long skills
        for (const skill of skills) {
          if (skill.steps && skill.steps.length > 20) {
            suggestions.push(`Skill "${skill.name}" has ${skill.steps.length} steps — consider splitting`);
          }
        }

        // Check for similar skill names using search
        const nameScores = new Map<string, Set<string>>();
        for (const skill of skills) {
          const results = searchSkills(skill.name, skills, 5);
          for (const r of results) {
            if (r.skill.name !== skill.name && r.score >= 0.5) {
              if (!nameScores.has(skill.name)) nameScores.set(skill.name, new Set());
              nameScores.get(skill.name)!.add(r.skill.name);
            }
          }
        }
        for (const [skillName, similar] of nameScores) {
          if (similar.size > 0) {
            suggestions.push(`Skill "${skillName}" similar to: ${Array.from(similar).join(", ")}`);
          }
        }

        // Propose curation if issues found
        for (const s of suggestions.slice(0, 3)) {
          proactiveEngine.suggest({
            title: "Skill Curation",
            body: s,
            context: `curation:${projectRoot}`,
            type: "recommendation",
            priority: "low",
            tags: ["curation", "skill"],
          });
        }
      }
    } catch (err) {
      console.error("[Daemon] Curation check failed:", err);
    }
  }

  private detectSkillOpportunity(data: any): void {
    // Analyze session for skill opportunity
    // Too many repeated similar tool calls or patterns
    const toolCounts = new Map<string, number>();
    if (data.messages) {
      for (const msg of data.messages) {
        if (typeof msg.content === "string" && msg.content.includes("tool_use")) {
          // Extract tool names from content
          const matches = msg.content.matchAll(/"name":\s*"([^"]+)"/g);
          for (const m of matches) {
            toolCounts.set(m[1], (toolCounts.get(m[1]) || 0) + 1);
          }
        }
      }
    }

    for (const [tool, count] of toolCounts) {
      if (count >= 5) {
        const name = skillProposalManager.generateSkillName(`${tool} workflow`, tool);
        skillProposalManager.propose({
          name,
          description: `Repetitive use of \`${tool}\` detected (${count} times). Consider creating a skill to automate this workflow.`,
          category: "auto-generated",
          triggers: [tool],
          steps: `Automated workflow using ${tool} tool. Replace repetitive manual invocations with this skill.`,
        });
        proactiveEngine.recordPattern(`skill:${tool}`);
      }
    }
  }

  private async runSelfReflection(): Promise<void> {
    this.context.lastReflection = new Date().toISOString();

    // Run full reflection analysis on recent sessions
    const results = selfReflection.reflect();
    for (const r of results) {
      for (const insight of r.insights) {
        proactiveEngine.suggest({
          title: "Agent Insight",
          body: insight,
          context: `reflection:${r.timestamp}`,
          type: "recommendation",
          priority: r.userSatisfaction < 0.7 ? "medium" : "low",
          tags: ["reflection", "insight"],
        });
      }
    }

    // Build and log preference rules
    const prefRules = preferenceLearner.buildPreferenceRules();
    if (prefRules.length > 0) {
      proactiveEngine.recordPattern(`preferences:${prefRules.length}-rules`);
    }

    // Sync preferences to global soul
    syncPreferencesToGlobalSoul(userProfile.getProfile());
  }

  /** Get daemon status */
  getStatus(): DaemonStatus {
    return {
      pid: this.pid,
      startedAt: this.startedAt,
      uptime: this.getUptime(),
      sessions: userProfile.getStats().sessions,
      turns: userProfile.getStats().turns,
      memoryUsage: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      activeAgents: subAgentManager.list().filter(a => a.status === "running" || a.status === "pending").length,
      pendingProposals: skillProposalManager.getStats().proposed,
      activeSuggestions: proactiveEngine.getActive().length,
      globalMemory: { facts: globalMemory.getStats().totalFacts, todos: globalMemory.getStats().todoCount, pendingResearch: globalMemory.getStats().pendingResearch },
      taskQueue: taskQueue.getStats(),
      autoResearch: autonomousResearcher.isAutoMode(),
    };
  }

  private getUptime(): number {
    return Math.round((Date.now() - new Date(this.startedAt).getTime()) / 1000);
  }

  /** Store a persistent fact */
  remember(key: string, value: string): void {
    this.context.learnedFacts.set(key, value);
  }

  /** Get a persistent fact */
  recall(key: string): string | undefined {
    return this.context.learnedFacts.get(key);
  }

  /** Build persistent context for system prompt */
  buildPersistentContext(): string {
    const parts: string[] = [];

    // User context from profile
    parts.push(userProfile.buildUserContext());
    parts.push(userProfile.buildPersonalityDirective());

    // Learned facts
    if (this.context.learnedFacts.size > 0) {
      const facts = Array.from(this.context.learnedFacts.entries())
        .map(([k, v]) => `- ${k}: ${v}`)
        .join("\n");
      parts.push(`Learned facts:\n${facts}`);
    }

    // Session start suggestions
    const sugText = proactiveEngine.buildSessionStartText();
    if (sugText) parts.push(sugText);

    // Active proposals
    const proposals = skillProposalManager.list();
    if (proposals.length > 0) {
      parts.push(`\n⚠️ Pending skill proposals (${proposals.length}): ${proposals.map(p => p.name).join(", ")}. Run /proposals to review.`);
    }

    return parts.join("\n");
  }

  isRunning(): boolean {
    return this.running;
  }
}

export const personalAgentDaemon = new PersonalAgentDaemon();

// ── Entry Point ─────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const command = args[0];

switch (command) {
  case "start":
  case undefined:
    personalAgentDaemon.start();
    // Keep process alive
    process.on("SIGINT", () => {
      personalAgentDaemon.stop();
      process.exit(0);
    });
    process.on("SIGTERM", () => {
      personalAgentDaemon.stop();
      process.exit(0);
    });
    break;

  case "stop":
    personalAgentDaemon.stop();
    break;

  case "status":
    console.log(JSON.stringify(personalAgentDaemon.getStatus(), null, 2));
    break;

  case "restart":
    personalAgentDaemon.stop();
    setTimeout(() => personalAgentDaemon.start(), 1000);
    break;

  default:
    console.log("Usage: lulu daemon [start|stop|status|restart]");
}