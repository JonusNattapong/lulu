import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { SchedulerManager } from "./scheduler.js";
import { notificationManager } from "./notifications.js";
import { loadConfig } from "./config.js";
import { eventBus } from "./events.js";
import type { AlwaysOnConfig, AlwaysOnStatus } from "../types/types.js";

const CONFIG_PATH = path.join(homedir(), ".lulu", "alwayson.json");
const DEFAULT_CONFIG: AlwaysOnConfig = {
  enabled: false,
  intervalMs: 60_000,
  autoTasks: [],
  notifications: { telegram: true, desktop: false },
  memoryGrowthReview: true,
};

class AlwaysOnService {
  private config: AlwaysOnConfig;
  private running = false;
  private intervalId?: ReturnType<typeof setInterval>;
  private tasksRun = 0;
  private notificationsSent = 0;
  private lastTick?: string;
  private nextTick?: string;

  constructor() {
    this.config = this.loadConfig();
  }

  private loadConfig(): AlwaysOnConfig {
    if (!existsSync(CONFIG_PATH)) {
      mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
      writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2));
      return DEFAULT_CONFIG;
    }
    try {
      return { ...DEFAULT_CONFIG, ...JSON.parse(readFileSync(CONFIG_PATH, "utf-8")) };
    } catch {
      return DEFAULT_CONFIG;
    }
  }

  private saveConfig(): void {
    writeFileSync(CONFIG_PATH, JSON.stringify(this.config, null, 2));
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.config.enabled = true;
    this.saveConfig();

    const tick = () => {
      this.lastTick = new Date().toISOString();
      this.nextTick = new Date(Date.now() + this.config.intervalMs).toISOString();
      eventBus.emit("alwayson:tick", { lastTick: this.lastTick });
      this.runTick().catch(err => {
        console.error("[alwayson] tick error:", err instanceof Error ? err.message : String(err));
      });
    };

    tick();
    this.intervalId = setInterval(tick, this.config.intervalMs);
    eventBus.emit("alwayson:start", {});
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.config.enabled = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    this.saveConfig();
    eventBus.emit("alwayson:stop", {});
  }

  updateConfig(patch: Partial<AlwaysOnConfig>): void {
    const wasRunning = this.running;
    if (wasRunning) this.stop();
    this.config = { ...this.config, ...patch };
    this.saveConfig();
    if (wasRunning && this.config.enabled) this.start();
  }

  getStatus(): AlwaysOnStatus {
    return {
      enabled: this.config.enabled,
      running: this.running,
      intervalMs: this.config.intervalMs,
      lastTick: this.lastTick,
      nextTick: this.nextTick,
      tasksRun: this.tasksRun,
      notificationsSent: this.notificationsSent,
    };
  }

  private async runTick(): Promise<void> {
    const scheduler = new SchedulerManager();
    const dueJobs = scheduler.getDueJobs();

    for (const job of dueJobs) {
      if (this.config.autoTasks.length > 0 && !this.config.autoTasks.includes(job.id)) continue;

      try {
        // Run job via scheduler's built-in runner
        const { runHeartbeatOnce } = await import("./heartbeat.js");
        const results = await runHeartbeatOnce(scheduler);
        for (const result of results) {
          this.tasksRun++;
          if (this.config.notifications.telegram) {
            this.notificationsSent++;
            await notificationManager.send({
              title: `Scheduled Job: ${job.name}`,
              body: result,
              source: "scheduler",
              priority: result.includes("failed") ? "medium" : "low",
              timestamp: new Date().toISOString(),
            });
          }
        }
      } catch (err: any) {
        if (this.config.notifications.telegram) {
          await notificationManager.send({
            title: `Job Failed: ${job.name}`,
            body: err.message,
            source: "scheduler",
            priority: "high",
            timestamp: new Date().toISOString(),
          });
        }
      }
    }

    // Memory growth review (optional daily check)
    if (this.config.memoryGrowthReview) {
      await this.memoryGrowthCheck();
    }
  }

  private async memoryGrowthCheck(): Promise<void> {
    const config = loadConfig();
    if (!config?.projectName) return;

    // Check memory file size directly
    const memoryPath = path.join(homedir(), ".lulu", "projects", config.projectName, "memory.db");
    const today = new Date().toISOString().split("T")[0];
    const todayKey = `review_${today}`;

    // Only run once per day
    const lastReviewPath = path.join(homedir(), ".lulu", `memory_review_${config.projectName}.txt`);
    if (existsSync(lastReviewPath)) {
      const lastReview = readFileSync(lastReviewPath, "utf-8").trim();
      if (lastReview === todayKey) return;
    }

    const size = existsSync(memoryPath) ? readFileSync(memoryPath, "utf-8").length : 0;
    if (size > 1024 && this.config.notifications.telegram) {
      this.notificationsSent++;
      writeFileSync(lastReviewPath, todayKey);
      await notificationManager.send({
        title: "Memory Growth Review",
        body: `Project "${config.projectName}" has ${(size / 1024).toFixed(1)}KB of memory. Consider reviewing.`,
        source: "agent",
        priority: "low",
        timestamp: new Date().toISOString(),
      });
    }
  }
}

export const alwaysOnService = new AlwaysOnService();
