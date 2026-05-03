/**
 * Scheduler Tools — register job management as Lulu tools.
 */

import { SchedulerManager } from "../../core/scheduler.js";
import { getJobRunner, jobRunners } from "../../core/job_runners.js";

// Lazy-init manager
let _manager: SchedulerManager | null = null;
function manager() {
  if (!_manager) _manager = new SchedulerManager();
  return _manager;
}

export const schedulerTools = [
  {
    name: "scheduler_list",
    description: "List all scheduled jobs and their status",
    category: "scheduler",
    input_schema: {
      type: "object",
      properties: {},
    },
    execute: async () => {
      const jobs = manager().status();
      if (!jobs.length) return "No scheduled jobs.";
      return jobs.map(j => `• ${j.id}: ${j.status} | priority: ${j.priority} | retry: ${j.retryCount}/${j.maxRetries} | next: ${j.nextRun || "?"} | last: ${j.lastRun || "never"}`).join("\n");
    },
  },
  {
    name: "scheduler_enable",
    description: "Enable a scheduled job by ID",
    category: "scheduler",
    input_schema: {
      type: "object",
      properties: {
        job_id: { type: "string", description: "Job ID to enable (e.g., daily_summary, repo_health)" },
      },
      required: ["job_id"],
    },
    execute: async ({ job_id }: { job_id: string }) => {
      const ok = manager().enable(job_id);
      return ok ? `Enabled job: ${job_id}` : `Job not found: ${job_id}`;
    },
  },
  {
    name: "scheduler_disable",
    description: "Disable a scheduled job by ID",
    category: "scheduler",
    input_schema: {
      type: "object",
      properties: {
        job_id: { type: "string", description: "Job ID to disable" },
      },
      required: ["job_id"],
    },
    execute: async ({ job_id }: { job_id: string }) => {
      const ok = manager().disable(job_id);
      return ok ? `Disabled job: ${job_id}` : `Job not found: ${job_id}`;
    },
  },
  {
    name: "scheduler_run",
    description: "Trigger a scheduled job to run immediately",
    category: "scheduler",
    input_schema: {
      type: "object",
      properties: {
        job_id: { type: "string", description: "Job ID to run now" },
      },
      required: ["job_id"],
    },
    execute: async ({ job_id }: { job_id: string }) => {
      const job = manager().get(job_id);
      if (!job) return `Job not found: ${job_id}`;
      const runner = getJobRunner(job);
      if (!runner) return `Runner not found for: ${job.handler}. Available: ${Object.keys(jobRunners).join(", ")}`;
      const result = await manager().runNow(job_id, runner);
      if (result.success) return `✅ Job completed:\n${result.output}`;
      const retry = result.nextRetryAt ? `\nRetry scheduled: ${result.nextRetryAt}` : "";
      return `❌ Job failed:${retry}\n${result.output}`;
    },
  },
  {
    name: "scheduler_history",
    description: "View recent job run history",
    category: "scheduler",
    input_schema: {
      type: "object",
      properties: {
        job_id: { type: "string", description: "Optional: filter by job ID" },
        limit: { type: "number", description: "Max records (default 10)" },
      },
    },
    execute: async ({ job_id, limit = 10 }: { job_id?: string; limit?: number }) => {
      const history = manager().history(job_id, limit);
      if (!history.length) return "No run history.";
      return history.map(h => {
        const ts = new Date(h.start).toLocaleString();
        const status = h.success ? "✅" : "❌";
        const duration = h.durationMs !== undefined ? ` (${h.durationMs}ms)` : "";
        const retry = h.nextRetryAt ? ` | retry: ${h.nextRetryAt}` : "";
        return `${status} ${h.jobId} attempt ${h.attempt} at ${ts}${duration}${retry}${h.error ? ` — ${h.error.slice(0, 80)}` : ""}`;
      }).join("\n");
    },
  },
  {
    name: "scheduler_logs",
    description: "View structured scheduler job logs",
    category: "scheduler",
    input_schema: {
      type: "object",
      properties: {
        job_id: { type: "string", description: "Optional: filter by job ID" },
        limit: { type: "number", description: "Max log entries (default 20)" },
      },
    },
    execute: async ({ job_id, limit = 20 }: { job_id?: string; limit?: number }) => {
      const logs = manager().logs(job_id, limit);
      if (!logs.length) return "No scheduler logs.";
      return logs.map((l) => {
        const ts = new Date(l.timestamp).toLocaleString();
        const attempt = l.attempt ? ` attempt ${l.attempt}` : "";
        return `[${ts}] ${l.level.toUpperCase()} ${l.jobId}${attempt}: ${l.message}`;
      }).join("\n");
    },
  },
];
