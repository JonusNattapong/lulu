import { Database } from "bun:sqlite";
import path from "node:path";
import { homedir } from "node:os";
import { existsSync, mkdirSync, appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { redact } from "./secrets.js";

export type AuditEventType =
  | "command"
  | "tool_call"
  | "tool_result"
  | "policy_decision"
  | "session_start"
  | "session_end"
  | "task_event"
  | "error"
  | "approval_request"
  | "approval_response";

export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface AuditEvent {
  id: string;
  type: AuditEventType;
  timestamp: string;
  projectName?: string;
  channel?: string;
  sessionId?: string;
  userId?: string;
  data: Record<string, any>;
  risk: RiskLevel;
  duration?: number; // ms
  success?: boolean;
  error?: string;
}

export interface AuditQuery {
  types?: AuditEventType[];
  projectName?: string;
  channel?: string;
  sessionId?: string;
  startDate?: string;
  endDate?: string;
  risk?: RiskLevel;
  limit?: number;
  offset?: number;
}

export interface AuditStats {
  total: number;
  byType: Record<string, number>;
  byRisk: Record<string, number>;
  byChannel: Record<string, number>;
  recentErrors: number;
  avgDuration: number;
}

export class AuditLog {
  private db: Database;
  private projectName: string;
  private writeQueue: AuditEvent[] = [];
  private flushInterval: NodeJS.Timeout | null = null;

  constructor(projectName: string) {
    this.projectName = projectName;
    const projectDir = path.join(homedir(), ".lulu", "projects", projectName);
    if (!existsSync(projectDir)) mkdirSync(projectDir, { recursive: true });

    const dbPath = path.join(projectDir, "audit.db");
    this.db = new Database(dbPath);
    this.init();

    // Start periodic flush
    this.flushInterval = setInterval(() => this.flush(), 5000);
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        project_name TEXT,
        channel TEXT,
        session_id TEXT,
        user_id TEXT,
        data TEXT,
        risk TEXT DEFAULT 'low',
        duration INTEGER,
        success INTEGER,
        error TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
      CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
      CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id);
      CREATE INDEX IF NOT EXISTS idx_events_channel ON events(channel);
      CREATE INDEX IF NOT EXISTS idx_events_risk ON events(risk);
    `);
  }

  // Generate unique ID
  private generateId(): string {
    return `audit-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  // Queue an event for batch insert
  log(event: Omit<AuditEvent, "id" | "timestamp">): string {
    const fullEvent: AuditEvent = {
      ...event,
      id: this.generateId(),
      timestamp: new Date().toISOString(),
    };

    this.writeQueue.push(fullEvent);

    // Flush if queue is too large
    if (this.writeQueue.length >= 100) {
      this.flush();
    }

    return fullEvent.id;
  }

  // Flush queued events to database
  private flush(): void {
    if (this.writeQueue.length === 0) return;

    const events = [...this.writeQueue];
    this.writeQueue = [];

    const stmt = this.db.prepare(`
      INSERT INTO events (id, type, timestamp, project_name, channel, session_id, user_id, data, risk, duration, success, error)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = this.db.transaction((events: AuditEvent[]) => {
      for (const e of events) {
        stmt.run(
          e.id,
          e.type,
          e.timestamp,
          e.projectName,
          e.channel,
          e.sessionId,
          e.userId,
          JSON.stringify(e.data),
          e.risk,
          e.duration,
          e.success ? 1 : 0,
          e.error
        );
      }
    });

    try {
      insertMany(events);
    } catch (err) {
      console.error("[Audit] Failed to flush events:", err);
      // Put events back in queue
      this.writeQueue = [...events, ...this.writeQueue];
    }
  }

  // Query events
  query(options: AuditQuery = {}): AuditEvent[] {
    const conditions: string[] = [];
    const params: any[] = [];

    if (options.types?.length) {
      conditions.push(`type IN (${options.types.map(() => "?").join(",")})`);
      params.push(...options.types);
    }

    if (options.projectName) {
      conditions.push("project_name = ?");
      params.push(options.projectName);
    }

    if (options.channel) {
      conditions.push("channel = ?");
      params.push(options.channel);
    }

    if (options.sessionId) {
      conditions.push("session_id = ?");
      params.push(options.sessionId);
    }

    if (options.startDate) {
      conditions.push("timestamp >= ?");
      params.push(options.startDate);
    }

    if (options.endDate) {
      conditions.push("timestamp <= ?");
      params.push(options.endDate);
    }

    if (options.risk) {
      conditions.push("risk = ?");
      params.push(options.risk);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = options.limit || 100;
    const offset = options.offset || 0;

    const rows = this.db
      .prepare(`SELECT * FROM events ${whereClause} ORDER BY timestamp DESC LIMIT ? OFFSET ?`)
      .all(...params, limit, offset) as any[];

    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      timestamp: row.timestamp,
      projectName: row.project_name,
      channel: row.channel,
      sessionId: row.session_id,
      userId: row.user_id,
      data: JSON.parse(row.data || "{}"),
      risk: row.risk,
      duration: row.duration,
      success: row.success === 1,
      error: row.error,
    }));
  }

  // Get statistics
  getStats(days: number = 7): AuditStats {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const rows = this.db
      .prepare("SELECT * FROM events WHERE timestamp >= ?")
      .all(startDate.toISOString()) as any[];

    const stats: AuditStats = {
      total: rows.length,
      byType: {},
      byRisk: {},
      byChannel: {},
      recentErrors: 0,
      avgDuration: 0,
    };

    let totalDuration = 0;
    let durationCount = 0;

    for (const row of rows) {
      // Count by type
      stats.byType[row.type] = (stats.byType[row.type] || 0) + 1;

      // Count by risk
      stats.byRisk[row.risk] = (stats.byRisk[row.risk] || 0) + 1;

      // Count by channel
      if (row.channel) {
        stats.byChannel[row.channel] = (stats.byChannel[row.channel] || 0) + 1;
      }

      // Count errors
      if (row.type === "error" || row.error) {
        stats.recentErrors++;
      }

      // Calculate average duration
      if (row.duration) {
        totalDuration += row.duration;
        durationCount++;
      }
    }

    stats.avgDuration = durationCount > 0 ? totalDuration / durationCount : 0;

    return stats;
  }

  // Export events to JSONL
  export(options: AuditQuery = {}): string {
    const events = this.query({ ...options, limit: 10000 });
    return events.map((e) => JSON.stringify(e)).join("\n");
  }

  // Export to file
  exportToFile(filePath: string, options: AuditQuery = {}): number {
    const events = this.query({ ...options, limit: 100000 });
    const content = events.map((e) => JSON.stringify(e)).join("\n");
    writeFileSync(filePath, content, "utf-8");
    return events.length;
  }

  // Clear old events
  clear(daysToKeep: number = 30): number {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const result = this.db
      .prepare("DELETE FROM events WHERE timestamp < ?")
      .run(cutoffDate.toISOString());

    return result.changes;
  }

  // Close and cleanup
  close(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    this.flush(); // Final flush
    this.db.close();
  }

  // Format report
  formatReport(stats: AuditStats): string {
    const lines = [
      "## Audit Report",
      "",
      `**Period:** Last 7 days`,
      `**Total Events:** ${stats.total}`,
      "",
      "### By Type",
    ];

    for (const [type, count] of Object.entries(stats.byType)) {
      lines.push(`- ${type}: ${count}`);
    }

    lines.push("", "### By Risk Level");
    for (const [risk, count] of Object.entries(stats.byRisk)) {
      const emoji = risk === "critical" ? "🔴" : risk === "high" ? "🟠" : risk === "medium" ? "🟡" : "🟢";
      lines.push(`${emoji} ${risk}: ${count}`);
    }

    if (Object.keys(stats.byChannel).length > 0) {
      lines.push("", "### By Channel");
      for (const [channel, count] of Object.entries(stats.byChannel)) {
        lines.push(`- ${channel}: ${count}`);
      }
    }

    lines.push("", "### Summary");
    lines.push(`- **Errors:** ${stats.recentErrors}`);
    lines.push(`- **Avg Duration:** ${stats.avgDuration.toFixed(0)}ms`);

    return lines.join("\n");
  }
}

// Singleton for global audit log
let globalAuditLog: AuditLog | null = null;

export function getAuditLog(projectName?: string): AuditLog {
  const name = projectName || "global";
  if (!globalAuditLog || (globalAuditLog as any).projectName !== name) {
    globalAuditLog = new AuditLog(name);
  }
  return globalAuditLog;
}

// Convenience functions for logging
export function logCommand(
  command: string,
  context: { sessionId?: string; channel?: string; success?: boolean }
) {
  getAuditLog().log({
    type: "command",
    data: { command },
    risk: "low",
    sessionId: context.sessionId,
    channel: context.channel,
    success: context.success,
  });
}

export function logToolCall(
  toolName: string,
  input: any,
  context: { sessionId?: string; channel?: string; duration?: number }
) {
  getAuditLog().log({
    type: "tool_call",
    data: { toolName, input: redact(JSON.stringify(input)) },
    risk: "medium",
    sessionId: context.sessionId,
    channel: context.channel,
    duration: context.duration,
  });
}

export function logPolicyDecision(
  toolName: string,
  allowed: boolean,
  reason: string,
  context: { sessionId?: string; channel?: string; risk?: RiskLevel }
) {
  getAuditLog().log({
    type: "policy_decision",
    data: { toolName, allowed, reason },
    risk: context.risk || "low",
    sessionId: context.sessionId,
    channel: context.channel,
    success: allowed,
  });
}

export function logError(
  error: string | Error,
  context: { sessionId?: string; channel?: string; type?: string }
) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;

  getAuditLog().log({
    type: "error",
    data: { message: errorMessage, stack },
    risk: "high",
    sessionId: context.sessionId,
    channel: context.channel,
    success: false,
    error: errorMessage,
  });
}

export function logApproval(
  toolName: string,
  approved: boolean,
  context: { sessionId?: string; channel?: string }
) {
  getAuditLog().log({
    type: "approval_request",
    data: { toolName },
    risk: "high",
    sessionId: context.sessionId,
    channel: context.channel,
    success: approved,
  });
}