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
import { getNextCronRun, isCronExpression } from "./scheduler.js";

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
  config: {
    agent?: boolean;
    subAgentPrompt?: string;
    notificationOnComplete?: boolean;
    repeat?: boolean;
    repeatInterval?: number; // ms
    maxRetries?: number;
    retryDelayMs?: number;
    timeoutMs?: number;
  };
  result?: string;
  error?: string;
  createdAt: string;
  scheduledAt?: string;
  startedAt?: string;
  endedAt?: string;
  runCount: number;
  retryCount: number;
}

const TASK_QUEUE_PATH = (() => {
  const { homedir } = require("node:os");
  const path = require("node:path");
  return path.join(homedir(), ".lulu", "task-queue.json");
})();

const { existsSync, readFileSync, writeFileSync, mkdirSync } = require("node:fs");

const MAX_CONCURRENT = 3;
const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_RETRY_DELAY_MS = 30_000;
const PRIORITY_ORDER: Record<TaskQueuePriority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

interface TaskQueueStore {
  tasks: QueuedTask[];
  lastCleanup: string;
}

class TaskQueueManager {
  private tasks: QueuedTask[] = [];
  private runningCount = 0;
  private schedulerInterval?: ReturnType<typeof setInterval>;

  constructor() {
    mkdirSync(require("node:path").dirname(TASK_QUEUE_PATH), { recursive: true });
    this.load();
    this.startScheduler();
  }

  private load(): void {
    try {
      if (existsSync(TASK_QUEUE_PATH)) {
        const store: TaskQueueStore = JSON.parse(readFileSync(TASK_QUEUE_PATH, "utf-8"));
        this.tasks = (store.tasks || []).map((t) => ({ ...t, retryCount: t.retryCount ?? 0 }));
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
      config: params.config || { maxRetries: 0, retryDelayMs: DEFAULT_RETRY_DELAY_MS, timeoutMs: DEFAULT_TIMEOUT_MS },
      createdAt: new Date().toISOString(),
      runCount: 0,
      retryCount: 0,
    };

    if (params.trigger?.at) {
      task.scheduledAt = params.trigger.at;
      task.status = "scheduled";
    } else if (params.trigger?.type === "schedule" && params.trigger.expression) {
      task.scheduledAt = this.resolveScheduleExpression(params.trigger.expression);
      task.status = "scheduled";
    }

    this.tasks.unshift(task);
    this.tasks = this.sortTasks(this.tasks);
    if (this.tasks.length > 200) this.tasks = this.tasks.slice(-200);
    this.save();

    eventBus.emit("taskqueue:enqueued", { taskId: task.id, name: task.name, type: task.type });
    return task;
  }

  /** Run a specific task with retry and timeout */
  async run(taskId: string): Promise<string> {
    const task = this.tasks.find((t) => t.id === taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);

    if (this.runningCount >= MAX_CONCURRENT) {
      task.status = "pending"; // re-queue if at capacity
      this.save();
      throw new Error(`Concurrency limit reached (${MAX_CONCURRENT} concurrent tasks)`);
    }

    task.status = "running";
    task.startedAt = new Date().toISOString();
    this.runningCount++;
    this.save();
    eventBus.emit("taskqueue:start", { taskId, name: task.name });

    try {
      const result = await this.executeWithTimeout(task);
      return await this.handleTaskSuccess(task, result);
    } catch (err: any) {
      return await this.handleTaskFailure(task, err);
    } finally {
      this.runningCount--;
      this.checkDeferredTasks();
    }
  }

  private async executeWithTimeout(task: QueuedTask): Promise<string> {
    const timeoutMs = task.config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const cfg = loadConfig({ ...process.env, LULU_CHANNEL: "subagent" });

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Task timeout after ${timeoutMs}ms`)), timeoutMs)
    );

    let result: string;
    if (task.config?.agent && task.config?.subAgentPrompt) {
      if (!cfg) return "Agent config unavailable";
      const res = await Promise.race([runAgent(cfg, task.config.subAgentPrompt, []), timeoutPromise]);
      result = (res as any)?.finalText || "Agent completed";
    } else {
      result = await Promise.race([this.autoExecute(task, cfg), timeoutPromise]);
    }

    return result;
  }

  private async handleTaskSuccess(task: QueuedTask, result: string): Promise<string> {
    task.result = result;
    task.status = "done";
    task.endedAt = new Date().toISOString();
    task.runCount++;
    task.error = undefined;

    // Repeat if configured
    if (task.config?.repeat && task.config?.repeatInterval) {
      task.scheduledAt = new Date(Date.now() + task.config.repeatInterval).toISOString();
      task.status = "scheduled";
    } else if (task.config?.repeat && task.trigger.type === "schedule" && task.trigger.expression) {
      task.scheduledAt = this.resolveScheduleExpression(task.trigger.expression);
      task.status = "scheduled";
    }

    this.save();
    eventBus.emit("taskqueue:done", { taskId: task.id, name: task.name, result });

    if (task.config?.notificationOnComplete) {
      await notificationManager.send({
        title: `Task Done: ${task.name}`,
        body: result?.slice(0, 200) || "Completed",
        source: "scheduler",
        priority: task.priority === "urgent" ? "high" : "low",
        timestamp: new Date().toISOString(),
      });
    }

    return result;
  }

  private async handleTaskFailure(task: QueuedTask, err: any): Promise<string> {
    const maxRetries = task.config?.maxRetries ?? 0;

    if (task.retryCount < maxRetries) {
      task.retryCount++;
      task.status = "scheduled";
      task.error = err.message;
      const baseDelay = task.config?.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
      const delay = baseDelay * Math.pow(2, task.retryCount - 1);
      task.scheduledAt = new Date(Date.now() + delay).toISOString();
      this.save();
      eventBus.emit("taskqueue:retry", { taskId: task.id, name: task.name, attempt: task.retryCount, maxRetries, scheduledAt: task.scheduledAt });
      throw err;
    }

    task.error = err.message;
    task.status = "failed";
    task.endedAt = new Date().toISOString();
    this.save();
    eventBus.emit("taskqueue:failed", { taskId: task.id, name: task.name, error: err.message });
    throw err;
  }

  private async autoExecute(task: QueuedTask, cfg: any): Promise<string> {
    const nameLower = task.name.toLowerCase();

    // Git operations
    if (nameLower.includes("git status") || nameLower.includes("check repo") || nameLower.includes("repo health") || nameLower.includes("git check")) {
      if (!cfg) return "Agent config unavailable";
      try {
        const { executeTool } = await import("../tools/tools.js");
        const result = await executeTool({ name: "git_status", input: {}, id: "auto" }, cfg);
        return result.content || "Check completed";
      } catch (e: any) { return `Git check failed: ${e.message}`; }
    }

    if (nameLower.includes("git log") || nameLower.includes("recent commit")) {
      if (!cfg) return "Agent config unavailable";
      try {
        const { executeTool } = await import("../tools/tools.js");
        const result = await executeTool({ name: "git_log", input: { max_count: 5 }, id: "auto" }, cfg);
        return result.content || "No recent commits";
      } catch (e: any) { return `Git log failed: ${e.message}`; }
    }

    // Todo / reminder operations
    if (nameLower.includes("remind") || nameLower.includes("todo")) {
      const todos = globalMemory.listTodos();
      return `Current todos (${todos.length}): ${todos.map((t) => `${t.done ? "✓" : "○"} ${t.text}`).join(", ")}`;
    }

    if (nameLower.includes("add todo") || nameLower.includes("new todo")) {
      const match = task.name.match(/(?:add|new)\s+todo[:\s]+(.+)/i) || task.description.match(/(?:add|new)\s+todo[:\s]+(.+)/i);
      if (match) {
        const text = match[1].trim();
        const priority = nameLower.includes("urgent") ? "high" : nameLower.includes("low") ? "low" : "medium";
        globalMemory.addTodo(text, priority);
        return `Added todo: "${text}"`;
      }
      return "No todo text found in task name or description";
    }

    // Research
    if (nameLower.includes("research")) {
      const pending = globalMemory.getPendingResearch();
      return `Pending research (${pending.length}): ${pending.map((p) => p.query).join("; ")}`;
    }

    // Reports
    if (nameLower.includes("report") || nameLower.includes("summary")) {
      const stats = globalMemory.getStats();
      return `Report: ${stats.totalFacts} facts, ${stats.todoCount} todos, ${stats.pendingResearch} research items`;
    }

    // Memory stats
    if (nameLower.includes("memory") && nameLower.includes("stats")) {
      const stats = globalMemory.getStats();
      const facts = globalMemory.list().slice(0, 10);
      const factLines = facts.map((f) => `  - ${f.key}: ${f.value}`).join("\n");
      return `Memory: ${stats.totalFacts} facts across categories: ${JSON.stringify(stats.byCategory)}\nRecent facts:\n${factLines}`;
    }

    // Skill curation check
    if (nameLower.includes("skill") && (nameLower.includes("curat") || nameLower.includes("check"))) {
      return "Skill curation check: Use /soul list or /index to trigger skill analysis";
    }

    // Sub-agent spawn
    if (nameLower.includes("subagent") || nameLower.includes("worker")) {
      if (!cfg) return "Agent config unavailable";
      const prompt = task.config?.subAgentPrompt || task.description || `Execute: ${task.name}`;
      const id = await subAgentManager.spawn({
        parentId: task.id,
        name: task.name,
        prompt,
        config: cfg,
      });
      return `Sub-agent spawned: ${id}`;
    }

    // Default: run as agent
    if (!cfg) return "Agent config unavailable";
    const res = await runAgent(cfg, `Execute: ${task.description || task.name}`, []);
    return res.finalText || "Completed";
  }

  private checkDeferredTasks(): void {
    if (this.runningCount >= MAX_CONCURRENT) return;
    const due = this.getDue();
    if (due.length > 0) {
      this.run(due[0].id).catch(() => {});
    }
  }

  /** Schedule a task for later */
  schedule(taskId: string, at: string): void {
    const task = this.tasks.find((t) => t.id === taskId);
    if (!task) return;
    task.scheduledAt = at;
    task.status = "scheduled";
    this.save();
  }

  /** Cancel a task */
  cancel(taskId: string): void {
    const task = this.tasks.find((t) => t.id === taskId);
    if (!task) return;
    task.status = "cancelled";
    task.endedAt = new Date().toISOString();
    this.save();
    eventBus.emit("taskqueue:cancelled", { taskId });
  }

  /** List tasks */
  list(status?: TaskQueueStatus): QueuedTask[] {
    if (status) return this.sortTasks(this.tasks.filter((t) => t.status === status));
    return this.sortTasks(this.tasks);
  }

  /** List pending and scheduled tasks */
  getDue(): QueuedTask[] {
    const now = Date.now();
    return this.sortTasks(this.tasks.filter((t) => {
      if (t.status === "pending") return true;
      if (t.status === "scheduled" && t.scheduledAt) {
        return new Date(t.scheduledAt).getTime() <= now;
      }
      return false;
    }));
  }

  /** Start the scheduler loop */
  private startScheduler(): void {
    if (this.schedulerInterval) return;

    this.schedulerInterval = setInterval(async () => {
      if (this.runningCount >= MAX_CONCURRENT) return;

      const due = this.getDue();
      for (const task of due) {
        if (this.runningCount >= MAX_CONCURRENT) break;
        try {
          await this.run(task.id);
        } catch (err) {
          console.error(`[TaskQueue] Task ${task.id} failed:`, err);
        }
      }
    }, 30_000);
  }

  /** Get stats */
  getStats(): { total: number; pending: number; scheduled: number; done: number; failed: number; running: number; retries: number } {
    return {
      total: this.tasks.length,
      pending: this.tasks.filter((t) => t.status === "pending").length,
      scheduled: this.tasks.filter((t) => t.status === "scheduled").length,
      done: this.tasks.filter((t) => t.status === "done").length,
      failed: this.tasks.filter((t) => t.status === "failed").length,
      running: this.runningCount,
      retries: this.tasks.reduce((sum, t) => sum + t.retryCount, 0),
    };
  }

  /** Remove old completed tasks */
  prune(maxAgeMs = 7 * 24 * 60 * 60 * 1000): void {
    const cutoff = Date.now() - maxAgeMs;
    this.tasks = this.tasks.filter(
      (t) =>
        !t.endedAt ||
        new Date(t.endedAt).getTime() > cutoff ||
        t.status === "pending" ||
        t.status === "scheduled"
    );
    this.save();
  }

  /** Stop the scheduler */
  stop(): void {
    if (this.schedulerInterval) {
      clearInterval(this.schedulerInterval);
      this.schedulerInterval = undefined;
    }
  }

  private sortTasks(tasks: QueuedTask[]): QueuedTask[] {
    return [...tasks].sort((a, b) => {
      const priorityDelta = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      const aDue = new Date(a.scheduledAt || a.createdAt).getTime();
      const bDue = new Date(b.scheduledAt || b.createdAt).getTime();
      return priorityDelta || aDue - bDue || a.id.localeCompare(b.id);
    });
  }

  private resolveScheduleExpression(expression: string): string {
    const trimmed = expression.trim();
    if (isCronExpression(trimmed)) return getNextCronRun(trimmed).toISOString();
    const at = new Date(trimmed);
    if (!Number.isNaN(at.getTime())) return at.toISOString();
    const delayMs = Number(trimmed);
    if (Number.isFinite(delayMs) && delayMs > 0) return new Date(Date.now() + delayMs).toISOString();
    throw new Error(`Invalid schedule expression: ${expression}`);
  }
}

export const taskQueue = new TaskQueueManager();
