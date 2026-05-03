import type { ScheduledJob } from "./scheduler.js";
import { runDailySummary } from "../jobs/daily_summary.js";
import { runMorningTest } from "../jobs/morning_test.js";
import { runRepoHealth } from "../jobs/repo_health.js";
import { runTelegramReport } from "../jobs/telegram_report.js";
import { runSleepLearning } from "../jobs/sleep_learning.js";

export type JobRunner = (job: ScheduledJob) => Promise<string>;

export const jobRunners: Record<string, JobRunner> = {
  "jobs/daily_summary": async () => runDailySummary({
    date: new Date().toISOString().split("T")[0],
    sessions: [],
    projectRoot: process.cwd(),
  }),
  "jobs/repo_health": async () => runRepoHealth(process.cwd()),
  "jobs/morning_test": async () => runMorningTest(process.cwd()),
  "jobs/telegram_report": async () => runTelegramReport(process.cwd()),
  "jobs/sleep_learning": async () => runSleepLearning(process.cwd()),
};

export function getJobRunner(job: ScheduledJob): JobRunner | null {
  return jobRunners[job.handler] || jobRunners[job.id] || null;
}
