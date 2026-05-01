import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type JobStatus = "idle" | "running" | "failed" | "paused";
export type JobFrequency = "once" | "hourly" | "daily" | "weekly" | "custom";

export interface ScheduledJob {
  id: string;
  name: string;
  description: string;
  frequency: JobFrequency;
  cron?: string; // for custom frequency
  handler: string; // module path or identifier
  enabled: boolean;
  status: JobStatus;
  lastRun?: string;
  lastSuccess?: string;
  lastError?: string;
  nextRun?: string;
  runCount: number;
}

interface ScheduleStore {
  jobs: Record<string, ScheduledJob>;
  history: JobRunRecord[];
}

export interface JobRunRecord {
  id: string;
  jobId: string;
  start: string;
  end?: string;
  success: boolean;
  error?: string;
  output?: string;
}

const SCHEDULE_FILE = join(homedir(), ".lulu", "scheduler.json");

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
      next.setDate(next.getDate() + ((7 - next.getDay() + 1) % 7 || 7));
      next.setHours(9, 0, 0, 0); // Monday 09:00
      if (next <= now) next.setDate(next.getDate() + 7);
      break;
    }
    case "once": {
      next.setMinutes(next.getMinutes() + 5);
      break;
    }
    default: {
      // Custom cron: HH:MM format for daily custom
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

export function isDue(nextRun?: string): boolean {
  if (!nextRun) return true;
  return new Date(nextRun) <= new Date();
}

// ── Store ──────────────────────────────────────────────────────────────────

function ensureStore(): ScheduleStore {
  if (!existsSync(SCHEDULE_FILE)) {
    mkdirSync(join(homedir(), ".lulu"), { recursive: true });
    const store: ScheduleStore = { jobs: {}, history: [] };
    writeFileSync(SCHEDULE_FILE, JSON.stringify(store, null, 2));
    return store;
  }
  return JSON.parse(readFileSync(SCHEDULE_FILE, "utf-8"));
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
  },
  {
    id: "repo_health",
    name: "Repo Health Check",
    description: "Check git status, test results, and code quality",
    frequency: "daily",
    handler: "jobs/repo_health",
    enabled: true,
  },
  {
    id: "morning_test",
    name: "Morning Test Run",
    description: "Run test suite every morning at 07:00",
    frequency: "custom",
    cron: "7:00",
    handler: "jobs/morning_test",
    enabled: false,
  },
  {
    id: "telegram_report",
    name: "Telegram Report",
    description: "Daily summary sent to configured Telegram chat",
    frequency: "daily",
    handler: "jobs/telegram_report",
    enabled: false,
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
      }
    }
    if (changed) saveStore(this.store);
  }

  list(): ScheduledJob[] {
    return Object.values(this.store.jobs).sort((a, b) => a.id.localeCompare(b.id));
  }

  get(id: string): ScheduledJob | null {
    return this.store.jobs[id] ?? null;
  }

  status(): { id: string; name: string; status: JobStatus; nextRun?: string; lastRun?: string }[] {
    return this.list().map((j) => ({
      id: j.id,
      name: j.name,
      status: j.status,
      nextRun: j.nextRun,
      lastRun: j.lastRun,
    }));
  }

  enable(id: string) {
    const job = this.store.jobs[id];
    if (!job) return false;
    job.enabled = true;
    job.nextRun = getNextRun(job.frequency, job.cron);
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

  async runNow(id: string, runner: (job: ScheduledJob) => Promise<string>): Promise<{ success: boolean; output: string }> {
    const job = this.store.jobs[id];
    if (!job) return { success: false, output: `Job ${id} not found` };
    if (this.runningJobs.has(id)) return { success: false, output: "Job already running" };

    this.runningJobs.add(id);
    job.status = "running";
    job.lastRun = new Date().toISOString();
    saveStore(this.store);

    const record: JobRunRecord = {
      id: `run_${Date.now()}`,
      jobId: id,
      start: new Date().toISOString(),
      success: false, // will be set in try/catch
    } as JobRunRecord;

    try {
      const output = await runner(job);
      job.status = "idle";
      job.lastSuccess = new Date().toISOString();
      job.lastError = undefined;
      job.runCount++;
      record.success = true;
      record.output = output;
    } catch (e: any) {
      job.status = "failed";
      job.lastError = e?.message || String(e);
      record.success = false;
      record.error = job.lastError;
    } finally {
      record.end = new Date().toISOString();
      job.nextRun = getNextRun(job.frequency, job.cron, job.lastRun);
      this.runningJobs.delete(id);
      this.store.history.push(record);
      if (this.store.history.length > 100) this.store.history = this.store.history.slice(-100);
      saveStore(this.store);
    }

    return { success: record.success, output: record.output || record.error || "" };
  }

  history(jobId?: string, limit = 20): JobRunRecord[] {
    const records = jobId
      ? this.store.history.filter((r) => r.jobId === jobId)
      : this.store.history;
    return records.slice(-limit).reverse();
  }

  getDueJobs(): ScheduledJob[] {
    return this.list().filter((j) => j.enabled && isDue(j.nextRun) && !this.runningJobs.has(j.id));
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
  update(id: string, patch: Partial<Pick<ScheduledJob, "name" | "description" | "frequency" | "cron" | "enabled">>): boolean {
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