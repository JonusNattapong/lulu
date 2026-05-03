import type { MessageParam } from "@anthropic-ai/sdk/resources/index.js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import type { AgentConfig } from "../types/types.js";

export type SessionChannel = "cli" | "api" | "telegram" | "dashboard" | "subagent";

export interface SessionRecord {
  id: string;
  channel: SessionChannel;
  subjectId: string;
  title: string;
  projectName?: string;
  projectRoot?: string;
  provider?: string;
  model?: string;
  messages: MessageParam[];
  turnCount: number;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface SessionCreateOptions {
  channel: SessionChannel;
  subjectId: string;
  title?: string;
  config?: AgentConfig | null;
  metadata?: Record<string, unknown>;
}

type SessionStore = Record<string, SessionRecord>;

const SESSION_FILE = path.join(homedir(), ".lulu", "sessions.json");
const DEFAULT_MAX_MESSAGES = 24;

export class SessionManager {
  private sessions: SessionStore;

  constructor(private readonly filePath = SESSION_FILE) {
    this.sessions = this.load();
  }

  list(): SessionRecord[] {
    return Object.values(this.sessions).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  get(id: string): SessionRecord | null {
    return this.sessions[id] ?? null;
  }

  getOrCreate(options: SessionCreateOptions): SessionRecord {
    const id = createSessionId(options.channel, options.subjectId, options.config?.projectName);
    const existing = this.sessions[id];
    if (existing) {
      this.touchMetadata(existing, options);
      return existing;
    }

    const now = new Date().toISOString();
    const session: SessionRecord = {
      id,
      channel: options.channel,
      subjectId: options.subjectId,
      title: options.title || `${options.channel}:${options.subjectId}`,
      projectName: options.config?.projectName,
      projectRoot: options.config?.projectRoot,
      provider: options.config?.provider,
      model: options.config?.model,
      messages: [],
      turnCount: 0,
      createdAt: now,
      updatedAt: now,
      metadata: options.metadata,
    };
    this.sessions[id] = session;
    this.save();
    return session;
  }

  saveMessages(id: string, messages: MessageParam[], config?: AgentConfig | null): SessionRecord {
    const session = this.sessions[id];
    if (!session) throw new Error(`Session not found: ${id}`);
    const maxMessages = parseMaxMessages();
    session.messages = messages.slice(-maxMessages);
    session.turnCount += 1;
    session.updatedAt = new Date().toISOString();
    if (config) {
      session.projectName = config.projectName;
      session.projectRoot = config.projectRoot;
      session.provider = config.provider;
      session.model = config.model;
    }
    this.save();
    return session;
  }

  reset(id: string): SessionRecord | null {
    const session = this.sessions[id];
    if (!session) return null;
    session.messages = [];
    session.turnCount = 0;
    session.updatedAt = new Date().toISOString();
    this.save();
    return session;
  }

  describe(id: string): string {
    const session = this.sessions[id];
    if (!session) return `Session not found: ${id}`;
    return [
      `Session: ${session.id}`,
      `Channel: ${session.channel}`,
      `Title: ${session.title}`,
      `Project: ${session.projectName || "unknown"}`,
      `Provider: ${session.provider || "unknown"}`,
      `Model: ${session.model || "unknown"}`,
      `Messages: ${session.messages.length}`,
      `Turns: ${session.turnCount}`,
      `Created: ${session.createdAt}`,
      `Updated: ${session.updatedAt}`,
    ].join("\n");
  }

  private touchMetadata(session: SessionRecord, options: SessionCreateOptions): void {
    let changed = false;
    if (options.config) {
      session.projectName = options.config.projectName;
      session.projectRoot = options.config.projectRoot;
      session.provider = options.config.provider;
      session.model = options.config.model;
      changed = true;
    }
    if (options.metadata) {
      session.metadata = { ...(session.metadata ?? {}), ...options.metadata };
      changed = true;
    }
    if (options.title && options.title !== session.title) {
      session.title = options.title;
      changed = true;
    }
    if (changed) this.save();
  }

  private load(): SessionStore {
    try {
      if (!existsSync(this.filePath)) return {};
      return JSON.parse(readFileSync(this.filePath, "utf-8")) as SessionStore;
    } catch {
      return {};
    }
  }

  private save(): void {
    const dir = path.dirname(this.filePath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    // Acquire exclusive write lock using a separate .lock file
    const lockPath = this.filePath + ".lock";
    let fd: number | undefined;
    try {
      fd = require("node:fs").openSync(lockPath, "w+");
      // Write atomically via temp file + rename
      const tmpPath = this.filePath + ".tmp." + process.pid;
      require("node:fs").writeFileSync(tmpPath, JSON.stringify(this.sessions, null, 2), "utf-8");
      require("node:fs").renameSync(tmpPath, this.filePath);
    } finally {
      if (fd !== undefined) require("node:fs").closeSync(fd);
      try { require("node:fs").unlinkSync(lockPath); } catch { /* ignore */ }
    }
  }
}

export function createSessionId(channel: SessionChannel, subjectId: string, projectName = "default"): string {
  return [channel, projectName, subjectId].map(sanitizeIdPart).join(":");
}

function sanitizeIdPart(value: string): string {
  return value.replace(/[^A-Za-z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "") || "default";
}

function parseMaxMessages(): number {
  const parsed = Number.parseInt(process.env.LULU_SESSION_MAX_MESSAGES || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_MESSAGES;
}
