#!/usr/bin/env node
import { SchedulerManager } from "./scheduler.js";
import { getJobRunner } from "./job_runners.js";

const DEFAULT_INTERVAL_MS = 60_000;

export interface HeartbeatOptions {
  intervalMs?: number;
  once?: boolean;
}

export async function runHeartbeatOnce(manager = new SchedulerManager()): Promise<string[]> {
  manager.scanJobsDir();
  let dueJobs: any[] = [];
  try {
    dueJobs = manager.getDueJobs();
  } catch (e: any) {
    console.error("[heartbeat] Failed to get due jobs:", e.message);
    return [];
  }
  const output: string[] = [];

  for (const job of dueJobs) {
    const runner = getJobRunner(job);
    if (!runner) {
      output.push(`${job.id}: no runner for ${job.handler}`);
      continue;
    }
    const result = await manager.runNow(job.id, runner);
    output.push(`${job.id}: ${result.success ? "success" : "failed"}\n${result.output}`);
  }

  return output;
}

export async function startHeartbeat(options: HeartbeatOptions = {}): Promise<void> {
  const intervalMs = options.intervalMs || parseInterval();
  const manager = new SchedulerManager();

  const tick = async () => {
    const results = await runHeartbeatOnce(manager);
    for (const result of results) console.log(`[heartbeat] ${result}`);
  };

  await tick();
  if (options.once) return;

  console.log(`[heartbeat] running every ${intervalMs}ms`);
  setInterval(() => {
    tick().catch((error) => {
      console.error("[heartbeat]", error instanceof Error ? error.message : String(error));
    });
  }, intervalMs);
}

function parseInterval(): number {
  const parsed = Number.parseInt(process.env.LULU_HEARTBEAT_INTERVAL_MS || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_INTERVAL_MS;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startHeartbeat({ once: process.argv.includes("--once") }).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
