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

    // Run skill proposal detection
    this.detectSkillOpportunity(data);

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

    const stats = userProfile.getStats();
    const proposals = skillProposalManager.getStats();
    const suggestions = proactiveEngine.getActive();

    // Generate insights
    if (stats.sessions > 0) {
      const avgTurns = stats.turns / stats.sessions;
      if (avgTurns > 20) {
        userProfile.addLearning(
          "insight",
          `Long sessions detected (avg ${avgTurns.toFixed(0)} turns). Consider breaking into smaller tasks.`,
          `sessions:${stats.sessions}:avg:${avgTurns}`,
          0.6
        );
      }
    }

    // Log reflection
    userProfile.addLearning(
      "insight",
      `Reflection at ${this.context.lastReflection}: ${stats.sessions} sessions, ${proposals.proposed} pending proposals, ${suggestions.length} active suggestions.`,
      "periodic-reflection",
      0.5
    );
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