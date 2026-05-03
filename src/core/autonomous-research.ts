/**
 * Autonomous Research Mode
 * Agent performs research in background without waiting for user prompt.
 * Runs as part of the daemon, triggered by research queue or scheduled intervals.
 */
import { eventBus } from "./events.js";
import { notificationManager } from "./notifications.js";
import { globalMemory } from "./global-memory.js";
import { runAgent } from "./agent.js";
import { loadConfig } from "./config.js";
import type { AgentConfig } from "../types/types.js";

export interface ResearchTopic {
  id: string;
  query: string;
  depth: "shallow" | "medium" | "deep";
  focus?: string[]; // specific aspects to investigate
  status: "queued" | "running" | "done" | "failed";
  result?: ResearchResult;
  createdAt: string;
  endedAt?: string;
  notificationsSent: boolean;
}

export interface ResearchResult {
  summary: string;
  findings: string[];
  sources: string[];
  facts: Array<{ key: string; value: string; confidence: number }>;
  nextSteps?: string[];
}

class AutonomousResearcher {
  private researchQueue: ResearchTopic[] = [];
  private running = false;
  private lastRun?: string;
  private autoMode = false;
  private autoLoopTimer?: ReturnType<typeof setInterval>;

  /** Enable/disable auto research mode */
  enableAutoResearch(enabled: boolean): void {
    this.autoMode = enabled;
    if (enabled) this.startAutoLoop();
  }

  /** Queue a research topic */
  queue(query: string, depth: "shallow" | "medium" | "deep" = "medium", focus?: string[]): string {
    const id = `research-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const topic: ResearchTopic = {
      id,
      query,
      depth,
      focus,
      status: "queued",
      createdAt: new Date().toISOString(),
      notificationsSent: false,
    };

    // Also add to global memory research queue
    globalMemory.queueResearch(query);

    this.researchQueue.unshift(topic);
    if (this.researchQueue.length > 20) this.researchQueue = this.researchQueue.slice(-20);

    eventBus.emit("research:queued", { id, query, depth });
    return id;
  }

  /** Run all pending research topics */
  async runAll(config?: AgentConfig): Promise<ResearchTopic[]> {
    const pending = this.researchQueue.filter(r => r.status === "queued");
    const results: ResearchTopic[] = [];

    for (const topic of pending) {
      const result = await this.runTopic(topic, config);
      results.push(result);
    }

    this.lastRun = new Date().toISOString();
    return results;
  }

  /** Run a specific research topic */
  async runTopic(topic: ResearchTopic, config?: AgentConfig): Promise<ResearchTopic> {
    topic.status = "running";
    eventBus.emit("research:start", { id: topic.id, query: topic.query });

    try {
      const agentConfig = config ?? loadConfig({ ...process.env, LULU_PROJECT_NAME: "research", LULU_CHANNEL: "research" });
      if (!agentConfig) throw new Error("No agent config available for research");

      // Build research prompt based on depth
      const prompt = this.buildResearchPrompt(topic);

      const result = await runAgent(agentConfig, prompt, []);

      const researchResult: ResearchResult = {
        summary: this.extractSummary(result.finalText || ""),
        findings: this.extractFindings(result.finalText || ""),
        sources: this.extractSources(result.finalText || ""),
        facts: this.extractFacts(result.finalText || ""),
        nextSteps: this.suggestNextSteps(result.finalText || ""),
      };

      topic.result = researchResult;
      topic.status = "done";
      topic.endedAt = new Date().toISOString();

      // Store facts in global memory
      for (const fact of researchResult.facts) {
        globalMemory.addFact({ key: fact.key, value: fact.value, source: "auto", category: "fact", confidence: fact.confidence });
      }

      // Mark research done in global memory
      globalMemory.markResearchDone(topic.id, researchResult.summary);

      // Notify if high priority
      if (topic.depth === "deep" && !topic.notificationsSent) {
        await notificationManager.send({
          title: `🔬 Research Complete: ${topic.query.slice(0, 60)}`,
          body: researchResult.summary.slice(0, 200),
          source: "daemon",
          priority: "medium",
          timestamp: new Date().toISOString(),
        });
        topic.notificationsSent = true;
      }

      eventBus.emit("research:done", { id: topic.id, summary: researchResult.summary });
    } catch (err: any) {
      topic.status = "failed";
      topic.endedAt = new Date().toISOString();
      eventBus.emit("research:failed", { id: topic.id, error: err.message });
    }

    return topic;
  }

  private buildResearchPrompt(topic: ResearchTopic): string {
    const depthConfig = {
      shallow: { maxTurns: 3, scope: "quick overview" },
      medium: { maxTurns: 8, scope: "comprehensive analysis" },
      deep: { maxTurns: 15, scope: "thorough investigation" },
    };
    const cfg = depthConfig[topic.depth];

    let prompt = `Research task: ${topic.query}\n\n`;
    prompt += `Scope: ${cfg.scope}\n`;
    prompt += `Goal: Provide a well-structured research report with:\n`;
    prompt += `1. A concise SUMMARY of what you found\n`;
    prompt += `2. KEY FINDINGS (numbered list)\n`;
    prompt += `3. SOURCES cited\n`;
    prompt += `4. FACTS as key=value pairs (extract 3-5 important facts)\n`;
    prompt += `5. NEXT STEPS or recommendations\n\n`;

    if (topic.focus?.length) {
      prompt += `Focus areas: ${topic.focus.join(", ")}\n\n`;
    }

    prompt += `Format your response with clear headers: SUMMARY, FINDINGS, SOURCES, FACTS, NEXT_STEPS`;

    return prompt;
  }

  private extractSummary(text: string): string {
    const match = text.match(/SUMMARY[:\s]*([\s\S]*?)(?=FINDINGS|FACTS|NEXT_STEPS|$)/i);
    return match?.[1]?.trim() || text.slice(0, 300);
  }

  private extractFindings(text: string): string[] {
    const match = text.match(/FINDINGS[:\s]*([\s\S]*?)(?=SOURCES|FACTS|NEXT_STEPS|$)/i);
    if (!match) return [];
    const items = match[1].match(/\d+\.\s*([^\n]+)/g);
    return items?.map(i => i.replace(/^\d+\.\s*/, "").trim()).filter(Boolean) || [];
  }

  private extractSources(text: string): string[] {
    const match = text.match(/SOURCES[:\s]*([\s\S]*?)(?=FACTS|NEXT_STEPS|$)/i);
    if (!match) return [];
    const urls = match[1].match(/https?:\/\/[^\s]+/g);
    return urls || [];
  }

  private extractFacts(text: string): Array<{ key: string; value: string; confidence: number }> {
    const match = text.match(/FACTS[:\s]*([\s\S]*?)(?=NEXT_STEPS|$)/i);
    if (!match) return [];
    const facts: Array<{ key: string; value: string; confidence: number }> = [];
    const lines = match[1].split("\n").filter(l => l.includes("=") || l.includes(":"));
    for (const line of lines.slice(0, 5)) {
      const [key, ...rest] = line.split(/[=:]/);
      if (key && rest.length) {
        facts.push({ key: key.trim(), value: rest.join("=").trim(), confidence: 0.8 });
      }
    }
    return facts;
  }

  private suggestNextSteps(text: string): string[] {
    const match = text.match(/NEXT_STEPS[:\s]*([\s\S]*?)$/i);
    if (!match) return [];
    const items = match[1].match(/\d+\.\s*([^\n]+)/g);
    return items?.map(i => i.replace(/^\d+\.\s*/, "").trim()).filter(Boolean) || [];
  }

  /** Start auto research loop (runs from daemon) */
  private startAutoLoop(): void {
    if (this.running) return;
    this.running = true;

    this.autoLoopTimer = setInterval(async () => {
      if (!this.autoMode) return;

      // Check global memory for pending research
      const pending = globalMemory.getPendingResearch();
      for (const p of pending) {
        const existing = this.researchQueue.find(r => r.id === p.id);
        if (!existing) {
          this.queue(p.query, "medium");
        }
      }

      // Run any queued research
      const queued = this.researchQueue.filter(r => r.status === "queued");
      if (queued.length > 0) {
        await this.runAll();
      }
    }, 5 * 60 * 1000); // Every 5 minutes
  }

  /** Stop the auto research loop */
  stop(): void {
    this.running = false;
    this.autoMode = false;
    if (this.autoLoopTimer) {
      clearInterval(this.autoLoopTimer);
      this.autoLoopTimer = undefined;
    }
  }

  /** List research topics */
  list(status?: string): ResearchTopic[] {
    if (status) return this.researchQueue.filter(r => r.status === status);
    return [...this.researchQueue].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  /** Get stats */
  getStats(): { total: number; queued: number; running: number; done: number; failed: number } {
    return {
      total: this.researchQueue.length,
      queued: this.researchQueue.filter(r => r.status === "queued").length,
      running: this.researchQueue.filter(r => r.status === "running").length,
      done: this.researchQueue.filter(r => r.status === "done").length,
      failed: this.researchQueue.filter(r => r.status === "failed").length,
    };
  }

  isAutoMode(): boolean {
    return this.autoMode;
  }
}

export const autonomousResearcher = new AutonomousResearcher();