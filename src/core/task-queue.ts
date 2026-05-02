/**
 * Background Task Queue
 * Automation queue that executes without user prompt, triggered by schedule or events.
 */
import { eventBus } from "./events.js";
import { notificationManager } from "./notifications.js";
import { globalMemory } from "./global-memory.js";
import { subAgentManager } from "./subagent.js";
import { runAgent } from "./agent.js";
import { loadConfig } from "./config.js";

export type TaskQueuePriority = "low" | "medium" | "high" | "urgent";
export type TaskQueueStatus = "pending" | "scheduled" | "running" | "done" | "failed" | "cancelled";

export interface QueuedTask {
  id: string;
  name: string;
  description: string;
  type: "research" | "automation" | "report" | "check" | "reminder" | "agent";
  status: TaskQueueStatus;
  priority: TaskQueuePriority;
  trigger: {
    type: "schedule" | "event" | "manual";
    expression?: string; // cron-like or event name
    at?: string; // ISO timestamp
  };
  config?: {
    agent?: boolean;
    subAgentPrompt?: string;
    notificationOnComplete?: boolean;
    repeat?: boolean;
    repeatInterval?: number; // ms
  };
  result?: string;
  error?: string;
  createdAt: string;
  scheduledAt?: string;
  startedAt?: string;
  endedAt?: string;
  runCount: number;
}

const TASK_QUEUE_PATH = (() => {
  const { homedir } = require("node:os");
  const path = require("node:path");
  return path.join(homedir(), ".lulu", "task-queue.json");
})();

const { existsSync, readFileSync, writeFileSync, mkdirSync } = require("node:fs");

interface TaskQueueStore {
  tasks: QueuedTask[];
  lastCleanup: string;
}

class TaskQueueManager {
  private tasks: QueuedTask[] = [];
  private runningInterval = false;

  constructor() {
    mkdirSync(require("node:path").dirname(TASK_QUEUE_PATH), { recursive: true });
    this.load();
    this.startScheduler();
  }

  private load(): void {
    try {
      if (existsSync(TASK_QUEUE_PATH)) {
        const store: TaskQueueStore = JSON.parse(readFileSync(TASK_QUEUE_PATH, "utf-8"));
        this.tasks = store.tasks || [];
      }
    } catch {
      this.tasks = [];
    }
  }

  private save(): void {
    writeFileSync(TASK_QUEUE_PATH, JSON.stringify({ tasks: this.tasks, lastCleanup: new Date().toISOString() }, null, 2));
  }

  /** Enqueue a task */
  enqueue(params: {
    name: string;
    description?: string;
    type?: QueuedTask["type"];
    priority?: TaskQueuePriority;
    trigger?: QueuedTask["trigger"];
    config?: QueuedTask["config"];
  }): QueuedTask {
    const task: QueuedTask = {
      id: `queue-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: params.name,
      description: params.description || params.name,
      type: params.type || "automation",
      status: "pending",
      priority: params.priority || "medium",
      trigger: params.trigger || { type: "manual" },
      config: params.config || {},
      createdAt: new Date().toISOString(),
      runCount: 0,
    };

    if (params.trigger?.at) {
      task.scheduledAt = params.trigger.at;
      task.status = "scheduled";
    }

    this.tasks.unshift(task);
    if (this.tasks.length > 200) this.tasks = this.tasks.slice(-200);
    this.save();

    eventBus.emit("taskqueue:enqueued", { taskId: task.id, name: task.name, type: task.type });
    return task;
  }

  /** Run a specific task */
  async run(taskId: string): Promise<string> {
    const task = this.tasks.find(t => t.id === taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);

    task.status = "running";
    task.startedAt = new Date().toISOString();
    this.save();
    eventBus.emit("taskqueue:start", { taskId, name: task.name });

    try {
      let result: string;

      if (task.config?.agent && task.config?.subAgentPrompt) {
        // Run as sub-agent
        const cfg = loadConfig({ ...process.env, LULU_CHANNEL: "subagent" });
        if (!cfg) { result = "Agent config unavailable"; }
        else {
          const res = await runAgent(cfg, task.config.subAgentPrompt, []);
          result = res.finalText || "Agent completed";
        }
      } else {
        // Generic task — auto-resolve based on name
        result = await this.autoExecute(task);
      }

      task.result = result;
      task.status = "done";
      task.endedAt = new Date().toISOString();
      task.runCount++;

      // Repeat if configured
      if (task.config?.repeat && task.config?.repeatInterval) {
        task.scheduledAt = new Date(Date.now() + task.config.repeatInterval).toISOString();
        task.status = "scheduled";
      }

      this.save();
      eventBus.emit("taskqueue:done", { taskId, name: task.name, result });

      if (task.config?.notificationOnComplete) {
        await notificationManager.send({
          title: `✅ Task Done: ${task.name}`,
          body: result?.slice(0, 200) || "Completed",
          source: "scheduler",
          priority: task.priority === "urgent" ? "high" : "low",
          timestamp: new Date().toISOString(),
        });
      }

      return result;
    } catch (err: any) {
      task.error = err.message;
      task.status = "failed";
      task.endedAt = new Date().toISOString();
      this.save();
      eventBus.emit("taskqueue:failed", { taskId, name: task.name, error: err.message });
      throw err;
    }
  }

  private async autoExecute(task: QueuedTask): Promise<string> {
    // Auto-resolve task type to actual work
    const nameLower = task.name.toLowerCase();
    const cfg = loadConfig({ ...process.env, LULU_PROJECT_NAME: "default" });

    if (nameLower.includes("git status") || nameLower.includes("check repo") || nameLower.includes("repo health")) {
      if (!cfg) return "Agent config unavailable";
      const { executeTool } = await import("../tools/tools.js");
      const result = await executeTool({ name: "git_status", input: {}, id: "auto" }, cfg);
      return result.content || "Check completed";
    }

    if (nameLower.includes("remind") || nameLower.includes("todo")) {
      const todos = globalMemory.listTodos();
      return `Current todos (${todos.length}): ${todos.map(t => `${t.done ? "✓" : "○"} ${t.text}`).join(", ")}`;
    }

    if (nameLower.includes("research")) {
      const pending = globalMemory.getPendingResearch();
      return `Pending research (${pending.length}): ${pending.map(p => p.query).join("; ")}`;
    }

    if (nameLower.includes("report") || nameLower.includes("summary")) {
      const stats = globalMemory.getStats();
      return `Report: ${stats.totalFacts} facts, ${stats.todoCount} todos, ${stats.pendingResearch} research items`;
    }

    // Default: return task description as result
    return `Task "${task.name}" executed: ${task.description}`;
  }

  /** Schedule a task for later */
  schedule(taskId: string, at: string): void {
    const task = this.tasks.find(t => t.id === taskId);
    if (!task) return;
    task.scheduledAt = at;
    task.status = "scheduled";
    this.save();
  }

  /** Cancel a task */
  cancel(taskId: string): void {
    const task = this.tasks.find(t => t.id === taskId);
    if (!task) return;
    task.status = "cancelled";
    task.endedAt = new Date().toISOString();
    this.save();
    eventBus.emit("taskqueue:cancelled", { taskId });
  }

  /** List tasks */
  list(status?: TaskQueueStatus): QueuedTask[] {
    if (status) return this.tasks.filter(t => t.status === status);
    return [...this.tasks].sort((a, b) => {
      const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }

  /** List pending and scheduled tasks */
  getDue(): QueuedTask[] {
    const now = Date.now();
    return this.tasks.filter(t => {
      if (t.status === "pending") return true;
      if (t.status === "scheduled" && t.scheduledAt) {
        return new Date(t.scheduledAt).getTime() <= now;
      }
      return false;
    });
  }

  /** Start the scheduler loop */
  private startScheduler(): void {
    if (this.runningInterval) return;
    this.runningInterval = true;

    setInterval(async () => {
      const due = this.getDue();
      for (const task of due) {
        try {
          await this.run(task.id);
        } catch (err) {
          console.error(`[TaskQueue] Task ${task.id} failed:`, err);
        }
      }
    }, 30_000); // Check every 30s
  }

  /** Get stats */
  getStats(): { total: number; pending: number; scheduled: number; done: number; failed: number } {
    return {
      total: this.tasks.length,
      pending: this.tasks.filter(t => t.status === "pending").length,
      scheduled: this.tasks.filter(t => t.status === "scheduled").length,
      done: this.tasks.filter(t => t.status === "done").length,
      failed: this.tasks.filter(t => t.status === "failed").length,
    };
  }

  /** Remove old completed tasks */
  prune(maxAgeMs = 7 * 24 * 60 * 60 * 1000): void {
    const cutoff = Date.now() - maxAgeMs;
    this.tasks = this.tasks.filter(t =>
      !t.endedAt || new Date(t.endedAt).getTime() > cutoff || t.status === "pending" || t.status === "scheduled"
    );
    this.save();
  }
}

export const taskQueue = new TaskQueueManager();