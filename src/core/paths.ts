import path from "node:path";
import { homedir } from "node:os";

// Base directories
export const LULU_DIR = path.join(homedir(), ".lulu");
export const PROJECTS_DIR = path.join(LULU_DIR, "projects");
export const PLUGINS_DIR = path.join(LULU_DIR, "plugins");
export const LOGS_DIR = path.join(LULU_DIR, "logs");
export const PROMPTS_DIR = path.join(LULU_DIR, "prompts");
export const TRAJECTORIES_DIR = path.join(LULU_DIR, "trajectories");

// Global files
export const CONFIG_FILE = path.join(LULU_DIR, "config.json");
export const SKILLS_FILE = path.join(LULU_DIR, "skills.json");
export const HISTORY_FILE = path.join(LULU_DIR, "history.jsonl");
export const IDENTITY_FILE = path.join(LULU_DIR, "identity.json");
export const ALWAYS_ON_CONFIG = path.join(LULU_DIR, "alwayson.json");
export const GLOBAL_MEMORY_FILE = path.join(LULU_DIR, "global-memory.json");
export const SCHEDULER_FILE = path.join(LULU_DIR, "scheduler.json");
export const TELEGRAM_CONFIG = path.join(LULU_DIR, "telegram.json");
export const APPROVAL_CONFIG = path.join(LULU_DIR, "approval-config.json");
export const DAEMON_PID_FILE = path.join(LULU_DIR, "daemon.pid");

// Project-specific path helpers
export function getProjectDir(projectName: string) {
  return path.join(PROJECTS_DIR, projectName);
}

export function getProjectMemoryDb(projectName: string) {
  return path.join(getProjectDir(projectName), "memory.db");
}

export function getProjectBrainDb(projectName: string) {
  return path.join(getProjectDir(projectName), "brain.db");
}
