import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type JobStatus = "idle" | "running" | "failed" | "paused";
export type JobFrequency = "once" | "hourly" | "daily" | "weekly" | "custom";
export type JobPriority = "low" | "medium" | "high" | "urgent";
export type JobLogLevel = "info" | "warn" | "error";

export interface ScheduledJob {
  id: string;
  name: string;
  description: string;
  frequency: JobFrequency;
  cron?: string; // for custom frequency
  handler: string; // module path or identifier
  enabled: boolean;
  status: JobStatus;
  priority?: JobPriority;
  maxRetries?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
  retryCount?: number;
  lastRun?: string;
  lastSuccess?: string;
  lastError?: string;
  lastDurationMs?: number;
  nextRun?: string;
  runCount: number;
}

interface ScheduleStore {
  jobs: Record<string, ScheduledJob>;
  history: JobRunRecord[];
  logs: JobLogEntry[];
}

export interface JobRunRecord {
  id: string;
  jobId: string;
  jobName?: string;
  start: string;
  end?: string;
  success: boolean;
  error?: string;
  output?: string;
  attempt: number;
  durationMs?: number;
  nextRetryAt?: string;
}

const SCHEDULE_FILE = join(homedir(), ".lulu", "scheduler.json");
const MAX_HISTORY = 500;
const MAX_LOGS = 1000;
const DEFAULT_RETRY_DELAY_MS = 60_000;
const DEFAULT_TIMEOUT_MS = 10 * 60_000;
const PRIORITY_ORDER: Record<JobPriority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

// ── Timing helpers ─────────────────────────────────────────────────────────

export function getNextRun(frequency: JobFrequency, cron?: string, lastRun?: string): string {
  const now = new Date();
  const next = new Date(now);

  switch (frequency) {
    case "hourly": {
      next.setHours(next.getHours() + 1, 0, 0, 0);
      break;
    }
    case "daily": {
      next.setDate(next.getDate() + 1);
      next.setHours(8, 0, 0, 0); // 08:00
      if (next <= now) next.setDate(next.getDate() + 1);
      break;
    }
    case "weekly": {
      // Find next Monday: (8 - day) % 7 gives 0 on Monday, 1 on Tuesday, ..., 6 on Sunday
      const daysUntilMonday = (8 - next.getDay()) % 7;
      next.setDate(next.getDate() + (daysUntilMonday === 0 ? 7 : daysUntilMonday));
      next.setHours(9, 0, 0, 0); // Monday 09:00
      if (next <= now) next.setDate(next.getDate() + 7);
      break;
    }
    case "once": {
      next.setMinutes(next.getMinutes() + 5);
      break;
    }
    default: {
      if (cron && isCronExpression(cron)) {
        return getNextCronRun(cron, now).toISOString();
      }
      // Backwards-compatible custom HH:MM daily format.
      if (cron && /^\d{1,2}:\d{2}$/.test(cron)) {
        const [h, m] = cron.split(":").map(Number);
        next.setHours(h, m, 0, 0);
        if (next <= now) next.setDate(next.getDate() + 1);
      } else {
        next.setMinutes(next.getMinutes() + 10);
      }
    }
  }

  return next.toISOString();
}

export function isCronExpression(expression: string): boolean {
  return expression.trim().split(/\s+/).length === 5;
}

export function getNextCronRun(expression: string, from = new Date()): Date {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) {
    throw new Error(`Invalid cron expression "${expression}". Expected 5 fields: minute hour day month weekday.`);
  }

  const [minuteField, hourField, dayField, monthField, weekdayField] = fields;
  const allowed = {
    minutes: parseCronField(minuteField, 0, 59, "minute"),
    hours: parseCronField(hourField, 0, 23, "hour"),
    days: parseCronField(dayField, 1, 31, "day"),
    months: parseCronField(monthField, 1, 12, "month"),
    weekdays: parseCronField(weekdayField, 0, 7, "weekday").map((d) => (d === 7 ? 0 : d)),
  };

  const candidate = new Date(from);
  candidate.setSeconds(0, 0);
  candidate.setMinutes(candidate.getMinutes() + 1);

  const maxMinutes = 366 * 24 * 60;
  for (let i = 0; i < maxMinutes; i++) {
    if (
      allowed.minutes.includes(candidate.getMinutes()) &&
      allowed.hours.includes(candidate.getHours()) &&
      allowed.days.includes(candidate.getDate()) &&
      allowed.months.includes(candidate.getMonth() + 1) &&
      allowed.weekdays.includes(candidate.getDay())
    ) {
      return candidate;
    }
    candidate.setMinutes(candidate.getMinutes() + 1);
  }

  throw new Error(`Cron expression "${expression}" did not produce a run time within one year.`);
}

function parseCronField(field: string, min: number, max: number, label: string): number[] {
  const values = new Set<number>();
  for (const part of field.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) throw new Error(`Invalid empty ${label} cron field.`);

    const [rangePart, stepPart] = trimmed.split("/");
    const step = stepPart ? Number(stepPart) : 1;
    if (!Number.isInteger(step) || step <= 0) throw new Error(`Invalid ${label} cron step: ${trimmed}`);

    let start: number;
    let end: number;
    if (rangePart === "*") {
      start = min;
      end = max;
    } else if (rangePart.includes("-")) {
      const [rawStart, rawEnd] = rangePart.split("-").map(Number);
      start = rawStart;
      end = rawEnd;
    } else {
      start = Number(rangePart);
      end = Number(rangePart);
    }

    if (!Number.isInteger(start) || !Number.isInteger(end) || start < min || end > max || start > end) {
      throw new Error(`Invalid ${label} cron range: ${trimmed}`);
    }

    for (let value = start; value <= end; value += step) values.add(value);
  }

  return Array.from(values).sort((a, b) => a - b);
}

export function isDue(nextRun?: string): boolean {
  if (!nextRun) return true;
  return new Date(nextRun) <= new Date();
}

// ── Store ──────────────────────────────────────────────────────────────────

function ensureStore(): ScheduleStore {
  if (!existsSync(SCHEDULE_FILE)) {
    mkdirSync(join(homedir(), ".lulu"), { recursive: true });
    const store: ScheduleStore = { jobs: {}, history: [], logs: [] };
    writeFileSync(SCHEDULE_FILE, JSON.stringify(store, null, 2));
    return store;
  }
  const store = JSON.parse(readFileSync(SCHEDULE_FILE, "utf-8")) as Partial<ScheduleStore>;
  return {
    jobs: store.jobs || {},
    history: store.history || [],
    logs: store.logs || [],
  };
}

function saveStore(store: ScheduleStore) {
  writeFileSync(SCHEDULE_FILE, JSON.stringify(store, null, 2));
}

// ── Default jobs ────────────────────────────────────────────────────────────

const DEFAULT_JOBS: Omit<ScheduledJob, "status" | "lastRun" | "lastSuccess" | "lastError" | "nextRun" | "runCount">[] = [
  {
    id: "daily_summary",
    name: "Daily Summary",
    description: "Summarize yesterday's conversations and project activity",
    frequency: "daily",
    handler: "jobs/daily_summary",
    enabled: true,
    priority: "medium",
    maxRetries: 2,
  },
  {
    id: "repo_health",
    name: "Repo Health Check",
    description: "Check git status, test results, and code quality",
    frequency: "daily",
    handler: "jobs/repo_health",
    enabled: true,
    priority: "high",
    maxRetries: 2,
  },
  {
    id: "morning_test",
    name: "Morning Test Run",
    description: "Run test suite every morning at 07:00",
    frequency: "custom",
    cron: "0 7 * * *",
    handler: "jobs/morning_test",
    enabled: false,
    priority: "medium",
    maxRetries: 1,
  },
  {
    id: "telegram_report",
    name: "Telegram Report",
    description: "Daily summary sent to configured Telegram chat",
    frequency: "daily",
    handler: "jobs/telegram_report",
    enabled: false,
    priority: "low",
    maxRetries: 3,
  },
  {
    id: "sleep_learning",
    name: "Sleep Learning (Ghost Worker)",
    description: "Background research and brain expansion during idle hours",
    frequency: "custom",
    cron: "0 2 * * *",
    handler: "jobs/sleep_learning",
    enabled: true,
    priority: "medium",
    maxRetries: 1,
  },
];

// ── Manager class ───────────────────────────────────────────────────────────

export class SchedulerManager {
  private store: ScheduleStore;
  private runningJobs = new Set<string>();

  constructor() {
    this.store = ensureStore();
    this.initDefaults();
  }

  private initDefaults() {
    let changed = false;
    for (const jobDef of DEFAULT_JOBS) {
      if (!this.store.jobs[jobDef.id]) {
        const job: ScheduledJob = {
          ...jobDef,
          status: "idle",
          runCount: 0,
          nextRun: getNextRun(jobDef.frequency, jobDef.cron),
        } as ScheduledJob;
        this.store.jobs[jobDef.id] = job;
        changed = true;
      } else {
        changed = this.normalizeJob(this.store.jobs[jobDef.id]) || changed;
      }
    }
    if (changed) saveStore(this.store);
  }

  private normalizeJob(job: ScheduledJob): boolean {
    let changed = false;
    if (!job.priority) {
      job.priority = "medium";
      changed = true;
    }
    if (job.retryCount === undefined) {
      job.retryCount = 0;
      changed = true;
    }
    if (job.maxRetries === undefined) {
      job.maxRetries = 0;
      changed = true;
    }
    if (job.retryDelayMs === undefined) {
      job.retryDelayMs = DEFAULT_RETRY_DELAY_MS;
      changed = true;
    }
    return changed;
  }

  list(): ScheduledJob[] {
    return Object.values(this.store.jobs).sort((a, b) => {
      const priorityDelta = PRIORITY_ORDER[a.priority || "medium"] - PRIORITY_ORDER[b.priority || "medium"];
      return priorityDelta || a.id.localeCompare(b.id);
    });
  }

  get(id: string): ScheduledJob | null {
    return this.store.jobs[id] ?? null;
  }

  status(): { id: string; name: string; status: JobStatus; priority: JobPriority; nextRun?: string; lastRun?: string; retryCount: number; maxRetries: number }[] {
    return this.list().map((j) => ({
      id: j.id,
      name: j.name,
      status: j.status,
      priority: j.priority || "medium",
      nextRun: j.nextRun,
      lastRun: j.lastRun,
      retryCount: j.retryCount || 0,
      maxRetries: j.maxRetries || 0,
    }));
  }

  enable(id: string) {
    const job = this.store.jobs[id];
    if (!job) return false;
    job.enabled = true;
    job.nextRun = getNextRun(job.frequency, job.cron);
    job.status = "idle";
    saveStore(this.store);
    return true;
  }

  disable(id: string) {
    const job = this.store.jobs[id];
    if (!job) return false;
    job.enabled = false;
    saveStore(this.store);
    return true;
  }

  async runNow(id: string, runner: (job: ScheduledJob) => Promise<string>): Promise<{ success: boolean; output: string; nextRetryAt?: string }> {
    const job = this.store.jobs[id];
    if (!job) return { success: false, output: `Job ${id} not found` };
    if (this.runningJobs.has(id)) return { success: false, output: "Job already running" };

    this.normalizeJob(job);
    this.runningJobs.add(id);
    job.status = "running";
    const startedAt = new Date();
    job.lastRun = startedAt.toISOString();
    saveStore(this.store);

    const record: JobRunRecord = {
      id: `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      jobId: id,
      jobName: job.name,
      start: startedAt.toISOString(),
      success: false, // will be set in try/catch
      attempt: (job.retryCount || 0) + 1,
    };

    this.log("info", id, `Starting job "${job.name}"`, record.id, record.attempt);

    try {
      const output = await withTimeout(runner(job), job.timeoutMs || DEFAULT_TIMEOUT_MS, job.id);
      job.status = "idle";
      job.lastSuccess = new Date().toISOString();
      job.lastError = undefined;
      job.retryCount = 0;
      job.runCount++;
      record.success = true;
      record.output = output;
      this.log("info", id, `Job completed`, record.id, record.attempt);
    } catch (e: any) {
      const message = e?.message || String(e);
      job.lastError = e?.message || String(e);
      record.success = false;
      record.error = message;

      const maxRetries = job.maxRetries || 0;
      if ((job.retryCount || 0) < maxRetries) {
        job.retryCount = (job.retryCount || 0) + 1;
        job.status = "idle";
        record.nextRetryAt = new Date(Date.now() + (job.retryDelayMs || DEFAULT_RETRY_DELAY_MS)).toISOString();
        job.nextRun = record.nextRetryAt;
        this.log("warn", id, `Job failed; retry ${job.retryCount}/${maxRetries} scheduled`, record.id, record.attempt, { error: message, nextRetryAt: record.nextRetryAt });
      } else {
        job.status = "failed";
        this.log("error", id, `Job failed with no retries remaining`, record.id, record.attempt, { error: message });
      }
    } finally {
      const endedAt = new Date();
      record.end = endedAt.toISOString();
      record.durationMs = endedAt.getTime() - startedAt.getTime();
      job.lastDurationMs = record.durationMs;
      if (!record.nextRetryAt) {
        if (job.frequency === "once" && record.success) {
          job.enabled = false;
          job.nextRun = undefined;
        } else {
          job.nextRun = getNextRun(job.frequency, job.cron, job.lastRun);
        }
      }
      this.runningJobs.delete(id);
      this.store.history.push(record);
      if (this.store.history.length > MAX_HISTORY) this.store.history = this.store.history.slice(-MAX_HISTORY);
      saveStore(this.store);
    }

    return { success: record.success, output: record.output || record.error || "", nextRetryAt: record.nextRetryAt };
  }

  history(jobId?: string, limit = 20): JobRunRecord[] {
    const records = jobId
      ? this.store.history.filter((r) => r.jobId === jobId)
      : this.store.history;
    return records.slice(-limit).reverse();
  }

  logs(jobId?: string, limit = 50): JobLogEntry[] {
    const logs = jobId ? this.store.logs.filter((l) => l.jobId === jobId) : this.store.logs;
    return logs.slice(-limit).reverse();
  }

  getDueJobs(): ScheduledJob[] {
    return this.list()
      .filter((j) => j.enabled && isDue(j.nextRun) && !this.runningJobs.has(j.id))
      .sort((a, b) => {
        const priorityDelta = PRIORITY_ORDER[a.priority || "medium"] - PRIORITY_ORDER[b.priority || "medium"];
        const nextDelta = new Date(a.nextRun || 0).getTime() - new Date(b.nextRun || 0).getTime();
        return priorityDelta || nextDelta || a.id.localeCompare(b.id);
      });
  }

  private log(level: JobLogLevel, jobId: string, message: string, runId?: string, attempt?: number, data?: Record<string, unknown>) {
    const entry: JobLogEntry = {
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      jobId,
      runId,
      timestamp: new Date().toISOString(),
      level,
      message,
      attempt,
      data,
    };
    this.store.logs.push(entry);
    if (this.store.logs.length > MAX_LOGS) this.store.logs = this.store.logs.slice(-MAX_LOGS);
  }

  /** Add a job from a JSON file at ~/.lulu/jobs/*.json */
  registerFromFile(filePath: string): ScheduledJob | null {
    try {
      const content = readFileSync(filePath, "utf-8");
      const jobDef = JSON.parse(content);
      if (!jobDef.id || !jobDef.name || !jobDef.handler) {
        console.error(`Scheduler: invalid job config in ${filePath}`);
        return null;
      }
      const job: ScheduledJob = {
        id: jobDef.id,
        name: jobDef.name,
        description: jobDef.description || "",
        frequency: jobDef.frequency || "once",
        cron: jobDef.cron,
        handler: jobDef.handler,
        enabled: jobDef.enabled ?? true,
        status: "idle",
        priority: jobDef.priority || "medium",
        maxRetries: jobDef.maxRetries || 0,
        retryDelayMs: jobDef.retryDelayMs || DEFAULT_RETRY_DELAY_MS,
        timeoutMs: jobDef.timeoutMs,
        retryCount: 0,
        runCount: 0,
        nextRun: getNextRun(jobDef.frequency, jobDef.cron),
      };
      this.store.jobs[jobDef.id] = job;
      saveStore(this.store);
      return job;
    } catch (e: any) {
      console.error(`Scheduler: failed to load job ${filePath}: ${e.message}`);
      return null;
    }
  }

  /** Scan ~/.lulu/jobs/ and register all *.json files */
  scanJobsDir(): number {
    const jobsDir = join(homedir(), ".lulu", "jobs");
    if (!existsSync(jobsDir)) return 0;
    let count = 0;
    for (const file of readdirSync(jobsDir)) {
      if (file.endsWith(".json")) {
        const loaded = this.registerFromFile(join(jobsDir, file));
        if (loaded) count++;
      }
    }
    return count;
  }

  /** Remove a job by ID */
  remove(id: string): boolean {
    if (!this.store.jobs[id]) return false;
    delete this.store.jobs[id];
    saveStore(this.store);
    return true;
  }

  /** Update job config (partial) */
  update(id: string, patch: Partial<Pick<ScheduledJob, "name" | "description" | "frequency" | "cron" | "enabled" | "priority" | "maxRetries" | "retryDelayMs" | "timeoutMs">>): boolean {
    const job = this.store.jobs[id];
    if (!job) return false;
    Object.assign(job, patch);
    if (patch.frequency || patch.cron) {
      job.nextRun = getNextRun(job.frequency, job.cron, job.lastRun);
    }
    saveStore(this.store);
    return true;
  }
}

export interface JobLogEntry {
  id: string;
  jobId: string;
  runId?: string;
  timestamp: string;
  level: JobLogLevel;
  message: string;
  attempt?: number;
  data?: Record<string, unknown>;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, jobId: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Job ${jobId} timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
